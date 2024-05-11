import { getSelectedServer, initServerSelection } from "./serverSelection.ts";
import { display_name } from "./config.ts"
import { Block, Direction, Player, Position, movePos, receiveAction, sendAction } from "./structs.ts";
import { Utf8ArrayToStr, bytesToInt, intToBytes, toUTF8Array } from "./conversion.ts";
import { CHAR_0 } from "https://deno.land/std@0.198.0/path/_constants.ts";
import { GLOBAL_SPEED, SKIN_BLOCK_COUNT, VIEWPORT_RADIUS, WAIT_FOR_DISCONNECTED_MS, clamp, dtCaps, getColorForBlockSkinId, getDtCap, iLerp, lerp, lerptt, orderTwoPos } from "./constants.ts";
import { dirname } from "https://deno.land/std@0.198.0/path/dirname.ts";

// Some dated code is using these in places like `for(i = 0`.
// While ideally these variables should all be made local,
// I'm worried some locations actually rely on them not being local.
// So for now these are all global, but we should slowly try to get rid of these.


export class Client {
	ws: WebSocket | null = null;
	prevTimeStamp: number | null = null;
	
	leaderboard: any[] = [];
	blocks: Block[] = [];
	players: Player[] = [];
	surroundings = Array.from({length: 25}, ()=> 0);

	camPos: Position = [0, 0];
	camPosSet: boolean = false;

	myPos: Position | null = null;
	pauseInit: boolean = false;
	myPlayer: Player | null = null;
	changeDirAt: null | number = null;
	changeDirAtIsHorizontal = false;
	myNextDir = 0;
	lastChangedDirPos: Position | null = null;

	lastClientsideMoves: {dir: Direction, pos: Position}[] = [];
	trailPushesDuringRequest: Position[] = [];
	isRequestingMyTrail = false;
	skipTrailRequestResponse = false;
	mapSize = 2000;
	closedBecauseOfDeath = false;
	currentDtCap = 0;
	totalDeltaTimeFromCap = 0;
	deltaTime = 16.66;
	lerpedDeltaTime = 16.66;
	missedFrames: number[] = [];
	gainedFrames: number[] = [];
	scoreStatTarget = 25;
	scoreStat = 25;
	realScoreStatTarget = 25;
	realScoreStat = 25;
	myRank = 0;
	myRankSent = false;
	totalPlayers = 0;
	playingAndReady = false;
	isTransitioning = false;
	doRefreshAfterDie = false;
	skipDeathTransition = false;
	allowSkipDeathTransition = false;
	deathTransitionTimeout: number | null = null;
	thisServerAvgPing = 0;
	thisServerDiffPing = 0;
	thisServerLastPing = 0;
	lastPingTime = 0;
	waitingForPing = false;
	lastMyPosSetClientSideTime = 0;
	lastMyPosServerSideTime = 0;
	lastMyPosSetValidClientSideTime = 0;
	lastMyPosHasBeenConfirmed = false;
	hasReceivedChunkThisGame = false;
	lastStatDeathType = 0;
	bestStatBlocks = CHAR_0;
	bestStatKills = CHAR_0;
	bestStatLbRank = CHAR_0;
	bestStatAlive = CHAR_0;
	bestStatNo1Time = 0;
	lastSendDir = -1; lastSendDirTime = 0;  //used to prevent spamming buttons
	sendDirQueue: {dir: Direction, addTime: number}[] = [];
	isConnecting = false;


	constructor(prog: (theSurroundings: number[],SendDir: (dir: Direction) => void) => void) {
		// TARTA: onkeydown => parseDirKey
		initServerSelection();
		this.doConnect();
		//best stats
		this.bestStatBlocks = Math.max(this.bestStatBlocks, Number(localStorage.getItem("bestStatBlocks")));
		this.bestStatKills = Math.max(this.bestStatKills, Number(localStorage.getItem("bestStatKills")));
		this.bestStatLbRank = Math.max(this.bestStatLbRank, Number(localStorage.getItem("bestStatLbRank")));
		this.bestStatAlive = Math.max(this.bestStatAlive, Number(localStorage.getItem("bestStatAlive")));
		this.bestStatNo1Time = Math.max(this.bestStatNo1Time, Number(localStorage.getItem("bestStatNo1Time")));
	
		//@ts-ignore: source
		setInterval(()=>{
			this.loop(Date.now());
		},10)
	
		prog(this.surroundings,this.sendDir.bind(this));
	
	};

	//gets a block from the specified array,
	//creates it if it doesn't exist yet
	//if array is not specified it will default to the blocks[] array
	getBlock(x: number, y: number, array?: Block[]) {
		let block;
		if (array === undefined) {
			array = this.blocks;
		}
		for (let i = 0; i < array.length; i++) {
			block = array[i];
			if (block.x == x && block.y == y) {
				return block;
			}
		}
		//block doesn't exist, create it
		block = new Block(x,y);
		array.push(block);
		return block;
	}

	//gets a player from the the specified array,
	//creates it if it doesn't exist yet
	//if array is not specified it will default to the players[] array
	getPlayer(id: number, array?: Player[]) {
		let player: Player;
		if (array === undefined) {
			array = this.players;
		}
		for (let i = 0; i < array.length; i++) {
			player = array[i];
			if (player.id == id) {
				return player;
			}
		}

		//player doesn't exist, create it
		player = new Player(id);
		array.push(player);
		if (player.isMyPlayer) {
			this.myPlayer = player;
		}
		return player;
	}

	//sends name to websocket
	sendName() {
		const n: string = display_name;
		if (n !== undefined && n !== null && n !== "" && n.trim() !== "") {
			this.wsSendMsg(sendAction.SET_USERNAME, n);
		}
	}

	//sends a legacy message which is required for older servers
	sendLegacyVersion() {
		this.wsSendMsg(sendAction.VERSION, {
			type: 0,
			ver: 28,
		});
	}

	//sends current skin to websocket
	sendSkin() {
		const blockColor = Number(localStorage.getItem("skinColor"));
		const pattern = Number(localStorage.getItem("skinPattern"));
		this.wsSendMsg(sendAction.SKIN, {
			blockColor: blockColor,
			pattern: pattern,
		});
	}

	//sends new direction to websocket
	sendDir(dir: Direction, skipQueue?: boolean) {
		// console.log("======sendDir",dir, skipQueue);
		console.log(this)
		if (!this.ws || !this.myPos) {
			return false;
		}
		//myPlayer doesn't exist
		if (!this.myPlayer) {
			return false;
		}

		//prevent spamming sendDir function
		if (
			dir == this.lastSendDir && //if dir is same as old sendDir call
			(Date.now() - this.lastSendDirTime) < 0.7 / GLOBAL_SPEED // if last call was less than 'one block travel time' ago
		) {
			return false;
		}
		this.lastSendDir = dir;
		this.lastSendDirTime = Date.now();

		//dir is already the current direction, don't do anything
		if (this.myPlayer.dir == dir) {
			// console.log("already current direction, don't do anything");
			this.addSendDirQueue(dir, skipQueue);
			return false;
		}

		//if dir is the opposite direction
		if (
			(dir === 0 && this.myPlayer.dir == 2) ||
			(dir == 2 && this.myPlayer.dir === 0) ||
			(dir == 1 && this.myPlayer.dir == 3) ||
			(dir == 3 && this.myPlayer.dir == 1)
		) {
			// console.log("already opposite direction, don't send");
			this.addSendDirQueue(dir, skipQueue);
			return false;
		}


		const horizontal = this.myPlayer.dir == 1 || this.myPlayer.dir == 3; //wether next direction is horizontal movement or not
		const coord = this.myPos[horizontal ? 1 : 0];
		const newPos: Position = [this.myPos[0], this.myPos[1]];
		const roundCoord = Math.round(coord);
		newPos[horizontal ? 1 : 0] = roundCoord;

		// console.log("test already sent");

		//test if the coordinate being sent wasn't already sent earlier
		// console.log(lastChangedDirPos);
		if (
			this.lastChangedDirPos !== null &&(
			(this.myPlayer.dir === 0 && newPos[0] <= this.lastChangedDirPos[0]) ||
			(this.myPlayer.dir == 1 && newPos[1] <= this.lastChangedDirPos[1]) ||
			(this.myPlayer.dir == 2 && newPos[0] >= this.lastChangedDirPos[0]) ||
			(this.myPlayer.dir == 3 && newPos[1] >= this.lastChangedDirPos[1]))
		) {
			// console.log("same coordinate, don't send");
			this.addSendDirQueue(dir, skipQueue);
			return false;
		}

		let changeDirNow = false;
		const blockPos = coord - Math.floor(coord);
		if (this.myPlayer.dir <= 1) { //right or down
			if (blockPos < 0.45) {
				changeDirNow = true;
			}
		} else if (this.myPlayer.dir <= 3) { //left or up
			if (blockPos > 0.55) {
				changeDirNow = true;
			}
		} else { //paused
			changeDirNow = true;
		}

		// console.log("changeDirNow",changeDirNow);

		if (changeDirNow) {
			this.changeMyDir(dir, newPos);
		} else {
			this.myNextDir = dir;
			this.changeDirAt = roundCoord;
			this.changeDirAtIsHorizontal = horizontal;
			this.lastChangedDirPos = [newPos[0], newPos[1]];
		}
		this.lastMyPosSetClientSideTime = Date.now();
		if (this.lastMyPosHasBeenConfirmed) {
			this.lastMyPosSetValidClientSideTime = Date.now();
		}
		this.lastMyPosHasBeenConfirmed = false;
		// console.log("send ======= UPDATE_DIR ======",dir,newPos);
		this.wsSendMsg(sendAction.UPDATE_DIR, {
			dir: dir,
			coord: newPos,
		});
		return true;
	}

	addSendDirQueue(dir: Direction, skip?: boolean) {
		// console.log("adding sendDir to queue", dir, skip);
		if (!skip && this.sendDirQueue.length < 3) {
			this.sendDirQueue.push({
				dir: dir,
				addTime: Date.now(),
			});
		}
	}

	changeMyDir(dir: Direction, newPos: Position, extendTrail?: boolean, isClientside?: boolean) {
		// console.log("changeMyDir");
		if(this.myPlayer === null) throw new Error('Impossible !');
		this.myPlayer.dir = this.myNextDir = dir;
		this.myPlayer.pos = [newPos[0], newPos[1]];
		this.lastChangedDirPos = [newPos[0], newPos[1]];
	
		if (extendTrail === undefined) {
			extendTrail = true;
		}
		if (isClientside === undefined) {
			isClientside = true;
		}
	
		if (extendTrail) {
			this.trailPush(this.myPlayer);
		}
	
		if (isClientside) {
			this.lastClientsideMoves.push({
				dir: dir,
				pos: newPos,
			});
		}
	}
	
	startRequestMyTrail() {
		this.isRequestingMyTrail = true;
		this.trailPushesDuringRequest = [];
		this.wsSendMsg(sendAction.REQUEST_MY_TRAIL);
	}
	
	trailPush(player: Player, pos?: Position) {
		if (player.trails.length > 0) {
			const lastTrail = player.trails[player.trails.length - 1].trail;
			if (lastTrail.length > 0) {
				const lastPos = lastTrail[lastTrail.length - 1];
				if (lastPos[0] != player.pos[0] || lastPos[1] != player.pos[1]) {
					if (pos === undefined) {
						pos = [player.pos[0], player.pos[1]];
					} else {
						pos = [pos[0], pos[1]];
					}
					lastTrail.push(pos);
					if (player.isMyPlayer && this.isRequestingMyTrail) {
						this.trailPushesDuringRequest.push(pos);
					}
				}
			}
		}
	}

	//when WebSocket connection is established
	onOpen() {
		this.isConnecting = false;
		this.sendLegacyVersion();
		this.sendName();
		this.wsSendMsg(sendAction.READY);
		countPlayGame();
	}


	//when WebSocket connection is closed
	onClose() {
		if (!!this.ws && this.ws.readyState == WebSocket.OPEN) {
			this.ws.close();
		}
		if (!this.playingAndReady) {
			if (!this.isTransitioning) {
				if (this.couldntConnect()) {
					// TARTA: BUG
				}
		} else if (!this.closedBecauseOfDeath) {
			throw new Error('The connection was lost');
		} else { //disconnect because of death

		}
		this.ws = null;
		this.isConnecting = false;
	}}

	//if trying to establish a connection but failed
	//returns true if it actually couldn't connect,
	//false if it will try again
	couldntConnect() {
		const err = new Error("couldntConnectError");
		console.log(err.stack);
		this.isTransitioning = true;
		return true;
	}

	//starts websocket connection
	//return true if it should start the transition on submit
	doConnect() {
		if (!this.ws && !this.isConnecting && !this.isTransitioning) {
			this.isConnecting = true;
			this.closedBecauseOfDeath = false;

			const server = getSelectedServer();
			if (!server) {
				this.onClose();
				return false;
			}
			this.thisServerAvgPing = this.thisServerLastPing = 0;
			this.ws = new WebSocket(server);
			this.ws.binaryType = "arraybuffer";
			const that = this;
			this.ws.onmessage = function (evt: MessageEvent) {
				if (that.ws == this) {
					that.onMessage(evt);
				}
			};
			this.ws.onclose = function (): void {
				if (that.ws == this) {
					that.onClose();
				}
			};
			this.ws.onopen = function () {
				if (that.ws == this) {
					that.onOpen();
				}
			};
			return true;
		}
		return false;
	}

	//when receiving a message from the websocket
	onMessage(evt: MessageEvent) {
		//console.log(evt);
		let x, y, type, id, player, w, h, block, i, j, nameBytes;
		const data: Uint8Array = new Uint8Array(evt.data);
		// console.log(evt.data);
		// for(let key in receiveAction){
		// 	if(receiveAction[key] == data[0]){
		// 		console.log(key);
		// 	}
		// }
		if (data[0] == receiveAction.UPDATE_BLOCKS) {
			x = bytesToInt(data[1], data[2]);
			y = bytesToInt(data[3], data[4]);
			type = data[5];
			block = this.getBlock(x, y);
			block.setBlockId(type);
			console.log(`<<< UPDATE_BLOCKS x:${x} y:${y} type:${type}`);
		}
		if (data[0] == receiveAction.PLAYER_POS) {
			x = bytesToInt(data[1], data[2]);
			y = bytesToInt(data[3], data[4]);
			id = bytesToInt(data[5], data[6]);
			console.log(`<<< PLAYER_POS x:${x} y:${y} id:${id}`);
			player = this.getPlayer(id);
			player.hasReceivedPosition = true;
			player.moveRelativeToServerPosNextFrame = true;
			player.lastServerPosSentTime = Date.now();
			this.lastMyPosHasBeenConfirmed = true;
			const newDir = data[7];
			const newPos: Position = [x, y];
			const newPosOffset = [x, y];

			//add distance traveled during server delay (ping/2)
			let posOffset = 0;
			if (player.isMyPlayer || this.thisServerAvgPing > 50) {
				posOffset = this.thisServerAvgPing / 2 * GLOBAL_SPEED;
			}
			movePos(newPosOffset, newDir, posOffset);

			let doSetPos = true;
			if (player.isMyPlayer) {
				this.lastMyPosServerSideTime = Date.now();
				// console.log("current dir:",player.dir, "myNextDir", myNextDir, "newDir", newDir);
				// console.log("newPosOffset",newPosOffset, "player.pos", player.pos);

				//if dir and pos are close enough to the current dir and pos
				if (
					(player.dir == newDir || this.myNextDir == newDir) &&
					Math.abs(newPosOffset[0] - player.pos[0]) < 1 &&
					Math.abs(newPosOffset[1] - player.pos[1]) < 1
				) {
					// console.log("newPosOffset",newPosOffset);
					// console.log("doSetPos is false because dir and pos are close enough to current dir and pos");
					doSetPos = false;
				}

				//if dir and pos are the first item of lastClientsideMoves
				//when two movements are made shortly after each other the
				//previous check (dir && pos) won't suffice, eg:
				// client makes move #1
				// client makes move #2
				// receives move #1 <-- different from current dir & pos
				// recieves move #2
				// console.log(lastClientsideMoves);
				if (this.lastClientsideMoves.length > 0) {
					//@ts-expect-error: We checked at the previous line that de array is not empty ! :)
					const lastClientsideMove: {dir: Direction, pos: Position} = this.lastClientsideMoves.shift();
					if (
						lastClientsideMove.dir == newDir &&
						lastClientsideMove.pos[0] == newPos[0] &&
						lastClientsideMove.pos[1] == newPos[1]
					) {
						doSetPos = false;
						// console.log("new dir is same as last isClientside move");
						// console.log("doSetPos = false;");
					} else {
						this.lastClientsideMoves = [];
						// console.log("empty lastClientsideMoves");
					}
				}

				if (player.dir == 4 || newDir == 4) { //is paused or is about to be paused
					// console.log("player.dir == 4 or newDir == 4, doSetPos = true");
					doSetPos = true;
				}

				// console.log("doSetPos:",doSetPos);
				if (doSetPos) {
					// console.log("==================doSetPos is true================");
					this.myNextDir = newDir;
					this.changeMyDir(newDir, newPos, false, false);
					//doSetPos is true, so the server thinks the player is somewhere
					//else than the client thinks he is. To prevent the trail from
					//getting messed up, request the full trail
					this.startRequestMyTrail();
					this.sendDirQueue = [];
				}

				//always set the server position
				player.serverPos = [newPosOffset[0], newPosOffset[1]];
				player.serverDir = newDir;

				this.removeBlocksOutsideViewport(player.pos);
			} else {
				player.dir = newDir;
			}

			if (doSetPos) {
				player.pos = newPosOffset;
				// console.log("doSetPos",newPosOffset);

				const extendTrailFlagSet = data.length > 8;
				if (extendTrailFlagSet) {
					const extendTrail = data[8] == 1;
					if (extendTrail) {
						this.trailPush(player, newPos);
					} else {
						player.trails.push({
							trail: [],
							vanishTimer: 0,
						});
					}
				}
			}

			if (!player.drawPosSet) {
				player.drawPos = [player.pos[0], player.pos[1]];
				player.drawPosSet = true;
			}
		}
		if (data[0] == receiveAction.FILL_AREA) {
			x = bytesToInt(data[1], data[2]);
			y = bytesToInt(data[3], data[4]);
			w = bytesToInt(data[5], data[6]);
			h = bytesToInt(data[7], data[8]);
			type = data[9];
			const pattern = data[10];
			const isEdgeChunk = data[11];
			console.log(`<<< FILL_AREA x:${x} y:${y} w:${w} h:${h} type:${type} pattern:${pattern} isEdgeChunk:${isEdgeChunk}`);
			this.fillArea(x, y, w, h, type, pattern, undefined, isEdgeChunk === 0);
		}
		if (data[0] == receiveAction.SET_TRAIL) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			const newTrail = [];
			//wether the new trail should replace the old trail (don't play animation)
			//or append it to the trails list (do play animation)
			let replace = false;
			for (i = 3; i < data.length; i += 4) {
				const coord = [bytesToInt(data[i], data[i + 1]), bytesToInt(data[i + 2], data[i + 3])];
				newTrail.push(coord);
			}
			if (player.isMyPlayer) {
				if (this.skipTrailRequestResponse) {
					this.skipTrailRequestResponse = false;
					this.trailPushesDuringRequest = [];
				} else {
					if (this.isRequestingMyTrail) {
						this.isRequestingMyTrail = false;
						replace = true;
						for (i = 0; i < this.trailPushesDuringRequest.length; i++) {
							newTrail.push(this.trailPushesDuringRequest[i]);
						}
						this.trailPushesDuringRequest = [];
					}
					//if last trail was emtpy (if entering enemy land) send a request for the new trail
					if (player.trails.length > 0) {
						const lastTrail = player.trails[player.trails.length - 1];
						if (lastTrail.trail.length <= 0 && newTrail.length > 0) {
							this.startRequestMyTrail();
						}
					}
				}
			}
			if (replace) {
				if (player.trails.length > 0) {
					const last = player.trails[player.trails.length - 1];
					//@ts-ignore
					last.trail = newTrail;
					last.vanishTimer = 0;
				} else {
					replace = false;
				}
			}
			if (!replace) {
				player.trails.push({
					//@ts-ignore
					trail: newTrail,
					vanishTimer: 0,
				});
			}
		}
		if (data[0] == receiveAction.EMPTY_TRAIL_WITH_LAST_POS) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			if (player.trails.length > 0) {
				const prevTrail = player.trails[player.trails.length - 1].trail;
				if (prevTrail.length > 0) {
					x = bytesToInt(data[3], data[4]);
					y = bytesToInt(data[5], data[6]);
					prevTrail.push([x, y]);
				}
			}

			//fix for trailing while in own land
			//when your ping is high and trail very short
			//(one block or so) you'll start trailing
			//in your own land. It's a ghost trail and you make
			//ghost deaths every time you hit the line
			if (player.isMyPlayer && this.isRequestingMyTrail) {
				this.skipTrailRequestResponse = true;
			}

			player.trails.push({
				trail: [],
				vanishTimer: 0,
			});
		}
		if (data[0] == receiveAction.PLAYER_DIE) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			if (data.length > 3) {
				x = bytesToInt(data[3], data[4]);
				y = bytesToInt(data[5], data[6]);
				player.pos = [x, y];
			}
			player.die(true);
		}
		if (data[0] == receiveAction.CHUNK_OF_BLOCKS) {
			x = bytesToInt(data[1], data[2]);
			y = bytesToInt(data[3], data[4]);
			w = bytesToInt(data[5], data[6]);
			h = bytesToInt(data[7], data[8]);
			i = 9;
			for (j = x; j < x + w; j++) {
				for (let k = y; k < y + h; k++) {
					block = this.getBlock(j, k);
					block.setBlockId(data[i], false);
					i++;
				}
			}
			if (!this.hasReceivedChunkThisGame) {
				this.hasReceivedChunkThisGame = true;
				this.wsSendMsg(sendAction.READY);
			}
		}
		if (data[0] == receiveAction.REMOVE_PLAYER) {
			id = bytesToInt(data[1], data[2]);
			for (i = this.players.length - 1; i >= 0; i--) {
				player = this.players[i];
				if (id == player.id) {
					this.players.splice(i, 1);
				}
			}
		}
		if (data[0] == receiveAction.PLAYER_NAME) {
			id = bytesToInt(data[1], data[2]);
			nameBytes = data.subarray(3, data.length);
			player = this.getPlayer(id);
			player.name = name;
		}
		if (data[0] == receiveAction.MY_SCORE) {
			const score = bytesToInt(data[1], data[2], data[3], data[4]);
			let kills = 0;
			if (data.length > 5) {
				kills = bytesToInt(data[5], data[6]);
			}
			this.scoreStatTarget = score;
			this.realScoreStatTarget = score + kills * 500;
			console.log(`### score: ${this.realScoreStatTarget}, kills: ${kills}, blocks: ${score}`);
		}
		if (data[0] == receiveAction.MY_RANK) {
			this.myRank = bytesToInt(data[1], data[2]);
			this.myRankSent = true;
			this.updateStats();
		}
		if (data[0] == receiveAction.LEADERBOARD) {
			this.totalPlayers = bytesToInt(data[1], data[2]);
			this.updateStats();
			this.leaderboard = [];
			i = 3;
			let rank = 1;
			while (true) {
				if (i >= data.length) {
					break;
				}
				const thisPlayerScore = bytesToInt(data[i], data[i + 1], data[i + 2], data[i + 3]);
				const nameLen: number = data[i + 4];
				nameBytes = data.subarray(i + 5, i + 5 + nameLen);
				const thisPlayerName = Utf8ArrayToStr(nameBytes);
				this.leaderboard.push({rank,name: thisPlayerName, score: thisPlayerScore});
				i = i + 5 + nameLen;
				rank++;
			}
			if (this.totalPlayers < 30 && this.doRefreshAfterDie) {
				throw new Error("This server is about to close, refresh to join a full server.");
			}
		}
		if (data[0] == receiveAction.MAP_SIZE) {
			this.mapSize = bytesToInt(data[1], data[2]);
			console.log(`<<< MAP_SIZE size:${this.mapSize}`);
		}
		if (data[0] == receiveAction.YOU_DED) {
			if (data.length > 1) {
				/*
				lastStatBlocks = bytesToInt(data[1], data[2], data[3], data[4]);
				if (lastStatBlocks > bestStatBlocks) {
					bestStatBlocks = lastStatBlocks;
					lsSet("bestStatBlocks", bestStatBlocks);
				}
				lastStatKills = bytesToInt(data[5], data[6]);
				if (lastStatKills > bestStatKills) {
					bestStatKills = lastStatKills;
					lsSet("bestStatKills", bestStatKills);
				}
				lastStatLbRank = bytesToInt(data[7], data[8]);
				if ((lastStatLbRank < bestStatLbRank || bestStatLbRank <= 0) && lastStatLbRank > 0) {
					bestStatLbRank = lastStatLbRank;
					lsSet("bestStatLbRank", bestStatLbRank);
				}
				lastStatAlive = bytesToInt(data[9], data[10], data[11], data[12]);
				if (lastStatAlive > bestStatAlive) {
					bestStatAlive = lastStatAlive;
					lsSet("bestStatAlive", bestStatAlive);
				}
				lastStatNo1Time = bytesToInt(data[13], data[14], data[15], data[16]);
				if (lastStatNo1Time > bestStatNo1Time) {
					bestStatNo1Time = lastStatNo1Time;
					lsSet("bestStatNo1Time", bestStatNo1Time);
				}
				*/
				this.lastStatDeathType = data[17];
				let _lastStatKiller = "";
				switch (this.lastStatDeathType) {
					case 1:
						if (data.length > 18) {
							nameBytes = data.subarray(18, data.length);
							_lastStatKiller = Utf8ArrayToStr(nameBytes);
						}
						break;
						case 2:
							_lastStatKiller = "the wall";
							break;
							case 3:
								_lastStatKiller = "yourself";
								break;
				}
				console.log(`<<< YOU_DED killer: ${_lastStatKiller}`);
			}
			this.closedBecauseOfDeath = true;
			this.allowSkipDeathTransition = true;
			//show newsbox
			this.deathTransitionTimeout = setTimeout(() => {
				// resetAll();
				if (this.skipDeathTransition) {
					doTransition("", false, () => {
						this.onClose();
						this.resetAll();
					});
				} else {
					// console.log("before doTransition",isTransitioning);
					doTransition("GAME OVER", true, null, () => {
						this.onClose();
						this.resetAll();
					}, true);
					// console.log("after doTransition",isTransitioning);
				}
				this.deathTransitionTimeout = null;
			}, 1000);
		}
		if (data[0] == receiveAction.MINIMAP) {
			const part = data[1];
			const xOffset = part * 20;
			for (i = 1; i < data.length; i++) {
				for (j = 0; j < 8; j++) {
					const filled = (data[i] & (1 << j)) !== 0;
					if (filled) {
						const bitNumber = (i - 2) * 8 + j;
						x = Math.floor(bitNumber / 80) % 80 + xOffset;
						y = bitNumber % 80;
						//minimapCtx.fillRect(x * 2, y * 2, 2, 2);
					}
				}
			}
		}
		if (data[0] == receiveAction.PLAYER_SKIN) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			if (player.isMyPlayer) {
				const _myColorId = data[3];
			}
			player.skinBlock = data[3];
		}
		if (data[0] == receiveAction.READY) {
			this.playingAndReady = true;
			if (!this.isTransitioning) {
				this.isTransitioning = true;
			}
		}
		if (data[0] == receiveAction.PLAYER_HIT_LINE) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			const pointsColor = getColorForBlockSkinId(data[3]);
			x = bytesToInt(data[4], data[5]);
			y = bytesToInt(data[6], data[7]);
			let _hitSelf = false;
			if (data.length > 8) {
				_hitSelf = data[8] == 1;
			}
			player.addHitLine([x, y], pointsColor);
		}
		if (data[0] == receiveAction.REFRESH_AFTER_DIE) {
			this.doRefreshAfterDie = true;
		}
		if (data[0] == receiveAction.PLAYER_HONK) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			const time = data[3];
			player.doHonk(time);
		}
		if (data[0] == receiveAction.PONG) {
			const ping = Date.now() - this.lastPingTime;
			const thisDiff = Math.abs(ping - this.thisServerLastPing);
			this.thisServerDiffPing = Math.max(this.thisServerDiffPing, thisDiff);
			this.thisServerDiffPing = lerp(thisDiff, this.thisServerDiffPing, 0.5);
			this.thisServerAvgPing = lerp(this.thisServerAvgPing, ping, 0.5);
			this.thisServerLastPing = ping;
			this.lastPingTime = Date.now();
			this.waitingForPing = false;
		}
		if (data[0] == receiveAction.UNDO_PLAYER_DIE) {
			id = bytesToInt(data[1], data[2]);
			player = this.getPlayer(id);
			player.undoDie();
		}
		if (data[0] == receiveAction.TEAM_LIFE_COUNT) {
			const _currentLives = data[1];
			const _totalLives = data[2];
		}
	}

	//send a message to the websocket, returns true if successful
	// deno-lint-ignore no-explicit-any
	wsSendMsg(action: sendAction, data?: any) {
		let utf8Array;
		if (!!this.ws && this.ws.readyState == WebSocket.OPEN) {
			const array = [action];
			if (action == sendAction.UPDATE_DIR) {
				console.log(`>>> UPDATE_DIR dir: ${data.dir}, x: ${data.coord[0]}, y: ${data.coord[1]}`);
				array.push(data.dir);
				const coordBytesX = intToBytes(data.coord[0], 2);
				array.push(coordBytesX[0]);
				array.push(coordBytesX[1]);
				const coordBytesY = intToBytes(data.coord[1], 2);
				array.push(coordBytesY[0]);
				array.push(coordBytesY[1]);
			}
			if (
				action == sendAction.SET_USERNAME || action == sendAction.SET_TEAM_USERNAME ||
				action == sendAction.PATREON_CODE
			) {
				console.log(`>>> ${sendAction[action]} data: ${data}`);
				utf8Array = toUTF8Array(data);
				array.push.apply(array, utf8Array);
			}
			if (action == sendAction.SKIN) {
				console.log(`>>> SKIN blockColor: ${data.blockColor}, pattern: ${data.pattern}.`);
				array.push(data.blockColor);
				array.push(data.pattern);
			}
			if (action == sendAction.REQUEST_CLOSE) {
				console.log(`>>> REQUEST_CLOSE data: ${data}`);
				for (let i = 0; i < data.length; i++) {
					array.push(data[i]);
				}
			}
			if (action == sendAction.HONK) {
				console.log(`>>> HONK data: ${data}`);
				array.push(data);
			}
			if (action == sendAction.MY_TEAM_URL) {
				utf8Array = toUTF8Array(data);
				array.push.apply(array, utf8Array);
			}
			if (action == sendAction.VERSION) {
				console.log(`>>> VERSION type: ${data.type}, ver: ${data.ver}`);
				array.push(data.type);
				const verBytes = intToBytes(data.ver, 2);
				array.push(verBytes[0]);
				array.push(verBytes[1]);
			}
			const payload = new Uint8Array(array);
			try {
				this.ws.send(payload);
				return true;
			} catch (ex) {
				console.log("error sending message", action, data, array, ex);
			}
		}
		return false;
	}

	//basically like refreshing the page
	resetAll() {
		if (!!this.ws && this.ws.readyState == WebSocket.OPEN) {
			this.ws.close();
		}
		this.ws = null;
		this.isConnecting = false;
		this.blocks = [];
		this.players = [];
		this.camPosSet = false;
		this.myPos = null;
		this.myRank = 0;
		this.scoreStat =
			this.scoreStatTarget =
			this.realScoreStat =
			this.realScoreStatTarget =
				25;
		this.myRankSent = false;
		this.totalPlayers = 0;
		this.playingAndReady = false;
		this.allowSkipDeathTransition = false;
		this.skipDeathTransition = false;
		this.hasReceivedChunkThisGame = false;
		if (this.doRefreshAfterDie) {
			location.reload();
		}
		this.sendDirQueue = [];
	}

	//fills an area, if array is not specified it defaults to blocks[]
	fillArea(x: number, y: number, w:number, h:number, type: number, pattern: number, array?: Block[], isEdgeChunk = false) {
		const defaultArray = array === undefined;
		if (defaultArray) {
			array = this.blocks;
		}

		if (pattern === undefined) {
			pattern = 0;
		}

		let x2 = x + w;
		let y2 = y + h;
		if (this.myPos !== null && defaultArray) {
			x = Math.max(x, Math.round(this.myPos[0]) - VIEWPORT_RADIUS);
			y = Math.max(y, Math.round(this.myPos[1]) - VIEWPORT_RADIUS);
			x2 = Math.min(x2, Math.round(this.myPos[0]) + VIEWPORT_RADIUS);
			y2 = Math.min(y2, Math.round(this.myPos[1]) + VIEWPORT_RADIUS);
		}

		for (let i = x; i < x2; i++) {
			for (let j = y; j < y2; j++) {
				const block = this.getBlock(i, j, array);
				//let thisType = applyPattern(type, pattern, i, j);
				block.setBlockId(type, isEdgeChunk ? false : Math.random() * 400);
			}
		}
	}

	//fixed lerp, calls lerp() multiple times when having a lower framerate
	lerpt(a: number, b: number, t: number) {
		return lerptt(a, b, t, this.deltaTime / 16.6666);
	}

	//moves (lerp) drawPos to the actual player position
	moveDrawPosToPos(player: Player) {
		// let xDist = Math.abs(player.pos[0] - player.drawPos[0]);
		// let yDist = Math.abs(player.pos[1] - player.drawPos[1]);
		let target = null;
		if (player.isDead && !player.deathWasCertain) {
			target = player.uncertainDeathPosition;
		} else {
			target = player.pos;
		}
		player.drawPos[0] = this.lerpt(player.drawPos[0], target[0], 0.23);
		player.drawPos[1] = this.lerpt(player.drawPos[1], target[1], 0.23);
	}


	// remove blocks that are too far away from the camera and are likely
	// to be seen without an updated state
	removeBlocksOutsideViewport(pos: number[]) {
		for (let i = this.blocks.length - 1; i >= 0; i--) {
			const block = this.blocks[i];
			if (
				block.x < pos[0] - VIEWPORT_RADIUS * 2 ||
				block.x > pos[0] + VIEWPORT_RADIUS * 2 ||
				block.y < pos[1] - VIEWPORT_RADIUS * 2 ||
				block.y > pos[1] + VIEWPORT_RADIUS * 2
			) {
				this.blocks.splice(i, 1);
			}
		}
	}

	//updates the stats in the bottom left corner
	updateStats() {
		if (this.myRank > this.totalPlayers && this.myRankSent) {
			this.totalPlayers = this.myRank;
		} else if ((this.totalPlayers < this.myRank) || (this.myRank === 0 && this.totalPlayers > 0)) {
			this.myRank = this.totalPlayers;
		}
	}

	loop(timeStamp: number) {
		let i, lastTrail;
		const realDeltaTime = timeStamp - (this.prevTimeStamp ?? 0);
		if (realDeltaTime > this.lerpedDeltaTime) {
			this.lerpedDeltaTime = realDeltaTime;
		} else {
			this.lerpedDeltaTime = this.lerpt(this.lerpedDeltaTime, realDeltaTime, 0.05);
		}
	
		if (realDeltaTime < lerp(getDtCap(this.currentDtCap), getDtCap(this.currentDtCap - 1), 0.9)) {
			this.gainedFrames.push(Date.now());
			while (this.gainedFrames.length > 190) {
				if (Date.now() - this.gainedFrames[0] > 10000) {
					this.gainedFrames.splice(0, 1);
				} else {
					this.currentDtCap--;
					this.gainedFrames = [];
					this.currentDtCap = clamp(this.currentDtCap, 0, dtCaps.length - 1);
					break;
				}
			}
		}
	
		if (realDeltaTime > lerp(getDtCap(this.currentDtCap), getDtCap(this.currentDtCap + 1), 0.05)) {
			this.missedFrames.push(Date.now());
			this.gainedFrames = [];
			while (this.missedFrames.length > 5) {
				if (Date.now() - this.missedFrames[0] > 5000) {
					this.missedFrames.splice(0, 1);
				} else {
					this.currentDtCap++;
					this.missedFrames = [];
					this.currentDtCap = clamp(this.currentDtCap, 0, dtCaps.length - 1);
					break;
				}
			}
		}
	
		this.deltaTime = realDeltaTime + this.totalDeltaTimeFromCap;
		this.prevTimeStamp = timeStamp;
	
		if (this.deltaTime < getDtCap(this.currentDtCap) && localStorage.dontCapFps != "true") {
			this.totalDeltaTimeFromCap += realDeltaTime;
		} else {
			this.totalDeltaTimeFromCap = 0;
			//draw blocks
			if(this.myPos)
			for(let i = 0; i < 5; i++){
				for(let j = 0; j < 5; j++){
					let block=this.getBlock(this.myPos[0]-2+j,this.myPos[1]-2+i).currentBlock;
					if(block >= 2){
						block=(block-2)%SKIN_BLOCK_COUNT+2; // Ignore pattern information 
					}
					this.surroundings[5*i+j]=block;
				}
			}
	
			//players
			let offset = this.deltaTime * GLOBAL_SPEED;
			for (let playerI = 0; playerI < this.players.length; playerI++) {
				const player = this.players[playerI];
	
				//move player
				if (!player.isDead || !player.deathWasCertain) {
					if (player.moveRelativeToServerPosNextFrame) {
						offset = (Date.now() - player.lastServerPosSentTime) * GLOBAL_SPEED;
					}
					if (player.isMyPlayer) {
						movePos(player.serverPos, player.serverDir, offset);
						if (player.serverDir == player.dir) {
							let clientServerDist = 0;
							if (localStorage.dontSlowPlayersDown != "true") {
								if (player.dir === 0 || player.dir == 2) { //left or right
									if (player.pos[1] == player.serverPos[1]) {
										if (player.dir === 0) { //right
											clientServerDist = player.pos[0] - player.serverPos[0];
										} else { //left
											clientServerDist = player.serverPos[0] - player.pos[0];
										}
									}
								} else { //up or down
									if (player.pos[0] == player.serverPos[0]) {
										if (player.dir == 1) { //down
											clientServerDist = player.pos[1] - player.serverPos[1];
										} else { //up
											clientServerDist = player.serverPos[1] - player.pos[1];
										}
									}
								}
							}
							clientServerDist = Math.max(0, clientServerDist);
							offset *= lerp(0.5, 1, iLerp(5, 0, clientServerDist));
						}
					}
					movePos(player.pos, player.dir, offset);
				}
				player.moveRelativeToServerPosNextFrame = false;
	
				this.moveDrawPosToPos(player);
	
				//test if player should be dead
				let playerShouldBeDead = false;
				if (
					player.drawPos[0] <= 0 || player.drawPos[1] <= 0 || player.drawPos[0] >= this.mapSize - 1 ||
					player.drawPos[1] >= this.mapSize - 1
				) {
					playerShouldBeDead = true;
				} else if (player.trails.length > 0) {
					lastTrail = player.trails[player.trails.length - 1].trail;
					const roundedPos = [Math.round(player.drawPos[0]), Math.round(player.drawPos[1])];
					if (
						Math.abs(roundedPos[0] - player.drawPos[0]) < 0.2 &&
						Math.abs(roundedPos[1] - player.drawPos[1]) < 0.2
					) {
						//only die if player.pos is close to the center of a block
						let touchingPrevTrail = true;
						for (i = lastTrail.length - 3; i >= 0; i--) {
							const pos1 = [Math.round(lastTrail[i][0]), Math.round(lastTrail[i][1])];
							const pos2 = [Math.round(lastTrail[i + 1][0]), Math.round(lastTrail[i + 1][1])];
							const twoPos = orderTwoPos(pos1, pos2);
							if (
								roundedPos[0] >= twoPos[0][0] &&
								roundedPos[0] <= twoPos[1][0] &&
								roundedPos[1] >= twoPos[0][1] &&
								roundedPos[1] <= twoPos[1][1]
							) {
								if (!touchingPrevTrail) {
									playerShouldBeDead = true;
								}
								touchingPrevTrail = true;
							} else {
								touchingPrevTrail = false;
							}
						}
					}
				}
				if (playerShouldBeDead) {
					if (!player.isDead) {
						player.die();
					}
				} else {
					player.didUncertainDeathLastTick = false;
				}
	
				//test if player shouldn't be dead after all
				if (player.isDead && !player.deathWasCertain && player.isDeadTimer > 1.5) {
					player.isDead = false;
					if (player.trails.length > 0) {
						lastTrail = player.trails[player.trails.length - 1];
						lastTrail.vanishTimer = 0;
					}
				}
	
				//if my player
				if (player.isMyPlayer) {
					if(this.pauseInit === false){
						this.sendDir(Direction.Pause);
						this.pauseInit = true;
					}
					this.myPos = [player.pos[0], player.pos[1]];
					if (this.camPosSet) {
						this.camPos[0] = this.lerpt(this.camPos[0], player.pos[0], 0.03);
						this.camPos[1] = this.lerpt(this.camPos[1], player.pos[1], 0.03);
					} else {
						this.camPos = [player.pos[0], player.pos[1]];
						this.camPosSet = true;
					}
	
					if (this.myNextDir != player.dir) {
						// console.log("myNextDir != player.dir (",myNextDir,"!=",player.dir,")");
						const horizontal = player.dir === 0 || player.dir == 2;
						//only change when currently traveling horizontally and new dir is not horizontal
						//or when new dir is horizontal but not currently traveling horizontally
						if (this.changeDirAtIsHorizontal != horizontal) {
							let changeDirNow = false;
							const currentCoord = player.pos[horizontal ? 0 : 1];
							if (player.dir === 0 || player.dir == 1) { //right & down
								if (this.changeDirAt && this.changeDirAt < currentCoord) {
									changeDirNow = true;
								}
							} else {
								if (this.changeDirAt && this.changeDirAt > currentCoord) {
									changeDirNow = true;
								}
							}
							if (changeDirNow && this.changeDirAt) {
								const newPos: Position = [player.pos[0], player.pos[1]];
								const tooFarTraveled = Math.abs(this.changeDirAt - currentCoord);
								newPos[horizontal ? 0 : 1] = this.changeDirAt;
								this.changeMyDir(this.myNextDir, newPos);
								movePos(player.pos, player.dir, tooFarTraveled);
							}
						}
					}
				}
	
				// drawPlayer(ctx, player, timeStamp);
			}
	
			//change dir queue
			if (this.sendDirQueue.length > 0) {
				const thisDir = this.sendDirQueue[0];
				if (
					Date.now() - thisDir.addTime > 1.2 / GLOBAL_SPEED || // older than '1.2 blocks travel time'
					this.sendDir(thisDir.dir, true) // senddir call was successful
				) {
					this.sendDirQueue.shift(); //remove item
				}
			}
			//corner stats
			this.scoreStat = this.lerpt(this.scoreStat, this.scoreStatTarget, 0.1);
			this.realScoreStat = this.lerpt(this.realScoreStat, this.realScoreStatTarget, 0.1);
	
	
	
			//engagementSetIsPlaying(this.playingAndReady && (Date.now() - this.lastSendDirTime) < 20000);
	
			//debug info
			if (localStorage.drawDebug == "true") {
				const _avg = Math.round(this.thisServerAvgPing);
				const _last = Math.round(this.thisServerLastPing);
				const _diff = Math.round(this.thisServerDiffPing);
			}
	
		}
	
		// if my position confirmation took too long
		const clientSideSetPosPassed = Date.now() - this.lastMyPosSetClientSideTime;
		const clientSideValidSetPosPassed = Date.now() - this.lastMyPosSetValidClientSideTime;
		const serverSideSetPosPassed = Date.now() - this.lastMyPosServerSideTime;
		// console.log(clientSideSetPosPassed, clientSideValidSetPosPassed, serverSideSetPosPassed);
		if (
			clientSideValidSetPosPassed > WAIT_FOR_DISCONNECTED_MS &&
			serverSideSetPosPassed - clientSideSetPosPassed > WAIT_FOR_DISCONNECTED_MS && !this.myPlayer?.isDead
		) {
			throw new Error('It seems you are disconnected.');
		}
	
		const maxPingTime = this.waitingForPing ? 10000 : 5000;
		if (this.ws !== null && Date.now() - this.lastPingTime > maxPingTime) {
			this.lastPingTime = Date.now();
			if (this.wsSendMsg(sendAction.PING)) {
				this.waitingForPing = true;
			}
		}
	
	}

	doSkipDeathTransition() {
		if (this.allowSkipDeathTransition) {
			if (this.deathTransitionTimeout !== null) {
				clearTimeout(this.deathTransitionTimeout);
				this.deathTransitionTimeout = null;
				this.onClose();
				doTransition("", false, () => {
					this.resetAll();
				});
			}
			this.skipDeathTransition = true;
		}
	}
}




function countPlayGame() {
	let old = 0;
	if (localStorage.getItem("totalGamesPlayed") !== null) {
		old = localStorage.totalGamesPlayed;
	}
	old++;
	lsSet("totalGamesPlayed", old.toString());
}


//localStorage with ios private mode error handling
function lsSet(name: string, value: string) {
	try {
		localStorage.setItem(name, value);
		return true;
	} catch (_error) {
		return false;
	}
}


//when page is finished loading








//called when a skinbutton is pressed
//add = -1 or 1 (increment/decrement)
//type = 0 (color) or 1 (pattern)



//apply camera transformations on a canvas
//canvasTransformType is a global that determines what
//transformation should be used



//starts the transition
//reverseOnHalf: start playing backwords once it is showing the title
//callback1: callback fired once the transition is full screen for the first time
//callback2: fired when full screen for the second time, only shown when reverseOnHalf = true
// deno-lint-ignore no-explicit-any
function doTransition(..._args: any[]) {
}




import { getSelectedServer, initServerSelection } from "./serverSelection.ts";
import { display_name } from "./config.ts"
import { Block, Direction, Player, Position, receiveAction, sendAction } from "./structs.ts";
import { Utf8ArrayToStr, bytesToInt, intToBytes, toUTF8Array } from "./conversion.ts";

const GLOBAL_SPEED = 0.006;
const VIEWPORT_RADIUS = 30;
// let MAX_ZOOM = 10000;
// let BLOCKS_ON_SCREEN = 20000;
const WAIT_FOR_DISCONNECTED_MS = 1000;


// Some dated code is using these in places like `for(i = 0`.
// While ideally these variables should all be made local,
// I'm worried some locations actually rely on them not being local.
// So for now these are all global, but we should slowly try to get rid of these.
let i;


// deno-lint-ignore no-explicit-any
let leaderboard: any[] = [];


let ws: WebSocket | null = null;
let prevTimeStamp: number | null = null;
let blocks: Block[] = [], players: Player[] = [];
const surroundings = Array.from({length: 25}, ()=> 0);
let camPos: Position = [0, 0], camPosSet: boolean = false;
let myPos: Position | null = null,
	myPlayer: Player | null = null,
	changeDirAt: null | number = null,
	changeDirAtIsHorizontal = false,
	myNextDir = 0,
	lastChangedDirPos: Position | null = null;
let lastClientsideMoves: {dir: Direction, pos: Position}[] = [],
	trailPushesDuringRequest: Position[] = [],
	isRequestingMyTrail = false,
	skipTrailRequestResponse = false;
let mapSize = 2000, closedBecauseOfDeath = false;
let	currentDtCap = 0,
	totalDeltaTimeFromCap = 0,
	deltaTime = 16.66,
	lerpedDeltaTime = 16.66,
	missedFrames: number[] = [],
	gainedFrames: number[] = [];
let	myRank = 0,
	myRankSent = false,
	totalPlayers = 0;
let scoreStatTarget = 25, scoreStat = 25, realScoreStatTarget = 25, realScoreStat = 25;
let playingAndReady = false;
let isTransitioning = false;
let doRefreshAfterDie = false;
let skipDeathTransition = false, allowSkipDeathTransition = false, deathTransitionTimeout: number | null = null;
let thisServerAvgPing = 0,
	thisServerDiffPing = 0,
	thisServerLastPing = 0,
	lastPingTime = 0,
	waitingForPing = false;
let lastMyPosSetClientSideTime = 0,
	lastMyPosServerSideTime = 0,
	lastMyPosSetValidClientSideTime = 0,
	lastMyPosHasBeenConfirmed = false;
let hasReceivedChunkThisGame = false;
let lastStatDeathType = 0;
let bestStatBlocks = 0, bestStatKills = 0, bestStatLbRank = 0, bestStatAlive = 0, bestStatNo1Time = 0;
const SKIN_BLOCK_COUNT = 13;
const colors = {
	grey: {
		BG: "#3a342f",
		brighter: "#4e463f",
		darker: "#2d2926",
		diagonalLines: "#c7c7c7",
	},
	red: {
		brighter: "#a22929",
		darker: "#7b1e1e",
		slightlyBrighter: "#af2c2c",
		pattern: "#8c2222",
		patternEdge: "#631717",
		boundsDark: "#420707",
		boundsBright: "#4c0808",
	},
	red2: {
		brighter: "#E3295E",
		darker: "#B3224B",
		slightlyBrighter: "#F02B63",
		pattern: "#CC2554",
		patternEdge: "#9C1C40",
	},
	pink: {
		brighter: "#A22974",
		darker: "#7A1F57",
		pattern: "#8A2262",
		patternEdge: "#5E1743",
		slightlyBrighter: "#B02C7E",
	},
	pink2: {
		brighter: "#7D26EF",
		darker: "#5E1DBA",
		pattern: "#6A21D1",
		patternEdge: "#4C1896",
		slightlyBrighter: "#882DFF",
	},
	purple: {
		brighter: "#531880",
		darker: "#391058",
		pattern: "#4b1573",
		patternEdge: "#3b115a",
		slightlyBrighter: "#5a198c",
	},
	blue: {
		brighter: "#27409c",
		darker: "#1d3179",
		pattern: "#213786",
		patternEdge: "#1b2b67",
		slightlyBrighter: "#2a44a9",
	},
	blue2: {
		brighter: "#3873E0",
		darker: "#2754A3",
		pattern: "#2F64BF",
		patternEdge: "#1F4587",
		slightlyBrighter: "#3B79ED",
	},
	green: {
		brighter: "#2ACC38",
		darker: "#1C9626",
		pattern: "#24AF30",
		patternEdge: "#178220",
		slightlyBrighter: "#2FD63D",
	},
	green2: {
		brighter: "#1e7d29",
		darker: "#18561f",
		pattern: "#1a6d24",
		patternEdge: "#14541c",
		slightlyBrighter: "#21882c",
	},
	leaf: {
		brighter: "#6a792c",
		darker: "#576325",
		pattern: "#5A6625",
		patternEdge: "#454F1C",
		slightlyBrighter: "#738430",
	},
	yellow: {
		brighter: "#d2b732",
		darker: "#af992b",
		pattern: "#D1A932",
		patternEdge: "#B5922B",
		slightlyBrighter: "#e6c938",
	},
	orange: {
		brighter: "#d06c18",
		darker: "#ab5a15",
		pattern: "#AF5B16",
		patternEdge: "#914A0F",
		slightlyBrighter: "#da7119",
	},
	gold: {
		brighter: "#F6B62C",
		darker: "#F7981B",
		pattern: "#DC821E",
		patternEdge: "#BD6B0E",
		slightlyBrighter: "#FBDF78",
		bevelBright: "#F9D485",
	},
};


function countPlayGame() {
	let old = 0;
	if (localStorage.getItem("totalGamesPlayed") !== null) {
		old = localStorage.totalGamesPlayed;
	}
	old++;
	lsSet("totalGamesPlayed", old.toString());
}



//gets a block from the specified array,
//creates it if it doesn't exist yet
//if array is not specified it will default to the blocks[] array
function getBlock(x: number, y: number, array?: Block[]) {
	let block;
	if (array === undefined) {
		array = blocks;
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
function getPlayer(id: number, array?: Player[]) {
	let player: Player;
	if (array === undefined) {
		array = players;
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
		myPlayer = player;
	}
	return player;
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


//sends name to websocket
function sendName() {
	const n: string = display_name;
	if (n !== undefined && n !== null && n !== "" && n.trim() !== "") {
		wsSendMsg(sendAction.SET_USERNAME, n);
	}
}


//sends a legacy message which is required for older servers
function sendLegacyVersion() {
	wsSendMsg(sendAction.VERSION, {
		type: 0,
		ver: 28,
	});
}

//sends current skin to websocket
function sendSkin() {
	const blockColor = Number(localStorage.getItem("skinColor"));
	const pattern = Number(localStorage.getItem("skinPattern"));
	wsSendMsg(sendAction.SKIN, {
		blockColor: blockColor,
		pattern: pattern,
	});
}

function _parseDirKey(c: number) {
	let pd = false;
	//up
	if (c == 38 || c == 87 || c == 56 || c == 73) {
		sendDir(3);
		pd = true;
	}
	//left
	if (c == 37 || c == 65 || c == 52 || c == 74) {
		sendDir(2);
		pd = true;
	}
	//right
	if (c == 39 || c == 68 || c == 54 || c == 76) {
		sendDir(0);
		pd = true;
	}
	//down
	if (c == 40 || c == 83 || c == 50 || c == 75) {
		sendDir(1);
		pd = true;
	}
	//pause
	if (c == 80) {
		sendDir(4);
		pd = true;
	}
	//space
	if (c == 32 || c == 53) {
		//honkStart();
		pd = true;
	}
	//enter
	if (c == 13) {
		doSkipDeathTransition();
		pd = true;
	}
	return pd;
}

//sends new direction to websocket
let lastSendDir = -1, lastSendDirTime = 0; //used to prevent spamming buttons
function sendDir(dir: Direction, skipQueue?: boolean) {
	// console.log("======sendDir",dir, skipQueue);
	if (!ws || !myPos) {
		return false;
	}
	//myPlayer doesn't exist
	if (!myPlayer) {
		return false;
	}

	//prevent spamming sendDir function
	if (
		dir == lastSendDir && //if dir is same as old sendDir call
		(Date.now() - lastSendDirTime) < 0.7 / GLOBAL_SPEED // if last call was less than 'one block travel time' ago
	) {
		return false;
	}
	lastSendDir = dir;
	lastSendDirTime = Date.now();

	//dir is already the current direction, don't do anything
	if (myPlayer.dir == dir) {
		// console.log("already current direction, don't do anything");
		addSendDirQueue(dir, skipQueue);
		return false;
	}

	//if dir is the opposite direction
	if (
		(dir === 0 && myPlayer.dir == 2) ||
		(dir == 2 && myPlayer.dir === 0) ||
		(dir == 1 && myPlayer.dir == 3) ||
		(dir == 3 && myPlayer.dir == 1)
	) {
		// console.log("already opposite direction, don't send");
		addSendDirQueue(dir, skipQueue);
		return false;
	}


	const horizontal = myPlayer.dir == 1 || myPlayer.dir == 3; //wether next direction is horizontal movement or not
	const coord = myPos[horizontal ? 1 : 0];
	const newPos: Position = [myPos[0], myPos[1]];
	const roundCoord = Math.round(coord);
	newPos[horizontal ? 1 : 0] = roundCoord;

	// console.log("test already sent");

	//test if the coordinate being sent wasn't already sent earlier
	// console.log(lastChangedDirPos);
	if (
		lastChangedDirPos !== null &&(
		(myPlayer.dir === 0 && newPos[0] <= lastChangedDirPos[0]) ||
		(myPlayer.dir == 1 && newPos[1] <= lastChangedDirPos[1]) ||
		(myPlayer.dir == 2 && newPos[0] >= lastChangedDirPos[0]) ||
		(myPlayer.dir == 3 && newPos[1] >= lastChangedDirPos[1]))
	) {
		// console.log("same coordinate, don't send");
		addSendDirQueue(dir, skipQueue);
		return false;
	}

	let changeDirNow = false;
	const blockPos = coord - Math.floor(coord);
	if (myPlayer.dir <= 1) { //right or down
		if (blockPos < 0.45) {
			changeDirNow = true;
		}
	} else if (myPlayer.dir <= 3) { //left or up
		if (blockPos > 0.55) {
			changeDirNow = true;
		}
	} else { //paused
		changeDirNow = true;
	}

	// console.log("changeDirNow",changeDirNow);

	if (changeDirNow) {
		changeMyDir(dir, newPos);
	} else {
		myNextDir = dir;
		changeDirAt = roundCoord;
		changeDirAtIsHorizontal = horizontal;
		lastChangedDirPos = [newPos[0], newPos[1]];
	}
	lastMyPosSetClientSideTime = Date.now();
	if (lastMyPosHasBeenConfirmed) {
		lastMyPosSetValidClientSideTime = Date.now();
	}
	lastMyPosHasBeenConfirmed = false;
	// console.log("send ======= UPDATE_DIR ======",dir,newPos);
	wsSendMsg(sendAction.UPDATE_DIR, {
		dir: dir,
		coord: newPos,
	});
	return true;
}

let sendDirQueue: {dir: Direction, addTime: number}[] = [];
function addSendDirQueue(dir: Direction, skip?: boolean) {
	// console.log("adding sendDir to queue", dir, skip);
	if (!skip && sendDirQueue.length < 3) {
		sendDirQueue.push({
			dir: dir,
			addTime: Date.now(),
		});
	}
}

function changeMyDir(dir: Direction, newPos: Position, extendTrail?: boolean, isClientside?: boolean) {
	// console.log("changeMyDir");
	if(myPlayer === null) throw new Error('Impossible !');
	myPlayer.dir = myNextDir = dir;
	myPlayer.pos = [newPos[0], newPos[1]];
	lastChangedDirPos = [newPos[0], newPos[1]];

	if (extendTrail === undefined) {
		extendTrail = true;
	}
	if (isClientside === undefined) {
		isClientside = true;
	}

	if (extendTrail) {
		trailPush(myPlayer);
	}

	if (isClientside) {
		lastClientsideMoves.push({
			dir: dir,
			pos: newPos,
		});
	}
}

function startRequestMyTrail() {
	isRequestingMyTrail = true;
	trailPushesDuringRequest = [];
	wsSendMsg(sendAction.REQUEST_MY_TRAIL);
}

function trailPush(player: Player, pos?: Position) {
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
				if (player.isMyPlayer && isRequestingMyTrail) {
					trailPushesDuringRequest.push(pos);
				}
			}
		}
	}
}


//when page is finished loading
export const start_the_game = function (prog: (theSurroundings: number[],theSendDir: (dir: Direction) => void) => void) {
	// TARTA: onkeydown => parseDirKey
	initServerSelection();
	doConnect();
	//best stats
	bestStatBlocks = Math.max(bestStatBlocks, Number(localStorage.getItem("bestStatBlocks")));
	bestStatKills = Math.max(bestStatKills, Number(localStorage.getItem("bestStatKills")));
	bestStatLbRank = Math.max(bestStatLbRank, Number(localStorage.getItem("bestStatLbRank")));
	bestStatAlive = Math.max(bestStatAlive, Number(localStorage.getItem("bestStatAlive")));
	bestStatNo1Time = Math.max(bestStatNo1Time, Number(localStorage.getItem("bestStatNo1Time")));

	//@ts-ignore: source
	setInterval(()=>{
		loop(Date.now());
	},10)

	prog(surroundings,sendDir);

};

//when WebSocket connection is established
function onOpen() {
	isConnecting = false;
	sendLegacyVersion();
	sendName();
	sendSkin();
	wsSendMsg(sendAction.READY);
	countPlayGame();
}


//when WebSocket connection is closed
function onClose() {
	if (!!ws && ws.readyState == WebSocket.OPEN) {
		ws.close();
	}
	if (!playingAndReady) {
		if (!isTransitioning) {
			if (couldntConnect()) {
				// TARTA: BUG
			}
	} else if (!closedBecauseOfDeath) {
		throw new Error('The connection was lost');
	} else { //disconnect because of death

	}
	ws = null;
	isConnecting = false;
}}

//if trying to establish a connection but failed
//returns true if it actually couldn't connect,
//false if it will try again
function couldntConnect() {
	const err = new Error("couldntConnectError");
	console.log(err.stack);
	isTransitioning = true;
	return true;
}


//starts websocket connection
//return true if it should start the transition on submit
let isConnecting = false;
function doConnect() {
	if (!ws && !isConnecting && !isTransitioning) {
		isConnecting = true;
		closedBecauseOfDeath = false;

		const server = getSelectedServer();
		if (!server) {
			onClose();
			return false;
		}
		thisServerAvgPing = thisServerLastPing = 0;
		ws = new WebSocket(server);
		ws.binaryType = "arraybuffer";
		ws.onmessage = function (evt: MessageEvent) {
			if (ws == this) {
				onMessage(evt);
			}
		};
		ws.onclose = function (): void {
			if (ws == this) {
				onClose();
			}
		};
		ws.onopen = function () {
			if (ws == this) {
				onOpen();
			}
		};
		return true;
	}
	return false;
}

//when receiving a message from the websocket
function onMessage(evt: MessageEvent) {
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
		block = getBlock(x, y);
		block.setBlockId(type);
		console.log(`<<< UPDATE_BLOCKS x:${x} y:${y} type:${type}`);
	}
	if (data[0] == receiveAction.PLAYER_POS) {
		x = bytesToInt(data[1], data[2]);
		y = bytesToInt(data[3], data[4]);
		id = bytesToInt(data[5], data[6]);
		console.log(`<<< PLAYER_POS x:${x} y:${y} id:${id}`);
		player = getPlayer(id);
		player.hasReceivedPosition = true;
		player.moveRelativeToServerPosNextFrame = true;
		player.lastServerPosSentTime = Date.now();
		lastMyPosHasBeenConfirmed = true;
		const newDir = data[7];
		const newPos: Position = [x, y];
		const newPosOffset = [x, y];

		//add distance traveled during server delay (ping/2)
		let posOffset = 0;
		if (player.isMyPlayer || thisServerAvgPing > 50) {
			posOffset = thisServerAvgPing / 2 * GLOBAL_SPEED;
		}
		movePos(newPosOffset, newDir, posOffset);

		let doSetPos = true;
		if (player.isMyPlayer) {
			lastMyPosServerSideTime = Date.now();
			// console.log("current dir:",player.dir, "myNextDir", myNextDir, "newDir", newDir);
			// console.log("newPosOffset",newPosOffset, "player.pos", player.pos);

			//if dir and pos are close enough to the current dir and pos
			if (
				(player.dir == newDir || myNextDir == newDir) &&
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
			if (lastClientsideMoves.length > 0) {
				//@ts-expect-error: We checked at the previous line that de array is not empty ! :)
				const lastClientsideMove: {dir: Direction, pos: Position} = lastClientsideMoves.shift();
				if (
					lastClientsideMove.dir == newDir &&
					lastClientsideMove.pos[0] == newPos[0] &&
					lastClientsideMove.pos[1] == newPos[1]
				) {
					doSetPos = false;
					// console.log("new dir is same as last isClientside move");
					// console.log("doSetPos = false;");
				} else {
					lastClientsideMoves = [];
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
				myNextDir = newDir;
				changeMyDir(newDir, newPos, false, false);
				//doSetPos is true, so the server thinks the player is somewhere
				//else than the client thinks he is. To prevent the trail from
				//getting messed up, request the full trail
				startRequestMyTrail();
				sendDirQueue = [];
			}

			//always set the server position
			player.serverPos = [newPosOffset[0], newPosOffset[1]];
			player.serverDir = newDir;

			removeBlocksOutsideViewport(player.pos);
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
					trailPush(player, newPos);
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
		fillArea(x, y, w, h, type, pattern, undefined, isEdgeChunk === 0);
	}
	if (data[0] == receiveAction.SET_TRAIL) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
		const newTrail = [];
		//wether the new trail should replace the old trail (don't play animation)
		//or append it to the trails list (do play animation)
		let replace = false;
		for (i = 3; i < data.length; i += 4) {
			const coord = [bytesToInt(data[i], data[i + 1]), bytesToInt(data[i + 2], data[i + 3])];
			newTrail.push(coord);
		}
		if (player.isMyPlayer) {
			if (skipTrailRequestResponse) {
				skipTrailRequestResponse = false;
				trailPushesDuringRequest = [];
			} else {
				if (isRequestingMyTrail) {
					isRequestingMyTrail = false;
					replace = true;
					for (i = 0; i < trailPushesDuringRequest.length; i++) {
						newTrail.push(trailPushesDuringRequest[i]);
					}
					trailPushesDuringRequest = [];
				}
				//if last trail was emtpy (if entering enemy land) send a request for the new trail
				if (player.trails.length > 0) {
					const lastTrail = player.trails[player.trails.length - 1];
					if (lastTrail.trail.length <= 0 && newTrail.length > 0) {
						startRequestMyTrail();
					}
				}
			}
		}
		if (replace) {
			if (player.trails.length > 0) {
				const last = player.trails[player.trails.length - 1];
				//@ts-expect-error: Dunno
				last.trail = newTrail;
				last.vanishTimer = 0;
			} else {
				replace = false;
			}
		}
		if (!replace) {
			player.trails.push({
				//@ts-expect-error: Dunno
				trail: newTrail,
				vanishTimer: 0,
			});
		}
	}
	if (data[0] == receiveAction.EMPTY_TRAIL_WITH_LAST_POS) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
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
		if (player.isMyPlayer && isRequestingMyTrail) {
			skipTrailRequestResponse = true;
		}

		player.trails.push({
			trail: [],
			vanishTimer: 0,
		});
	}
	if (data[0] == receiveAction.PLAYER_DIE) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
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
				block = getBlock(j, k);
				block.setBlockId(data[i], false);
				i++;
			}
		}
		if (!hasReceivedChunkThisGame) {
			hasReceivedChunkThisGame = true;
			wsSendMsg(sendAction.READY);
		}
	}
	if (data[0] == receiveAction.REMOVE_PLAYER) {
		id = bytesToInt(data[1], data[2]);
		for (i = players.length - 1; i >= 0; i--) {
			player = players[i];
			if (id == player.id) {
				players.splice(i, 1);
			}
		}
	}
	if (data[0] == receiveAction.PLAYER_NAME) {
		id = bytesToInt(data[1], data[2]);
		nameBytes = data.subarray(3, data.length);
		player = getPlayer(id);
		player.name = name;
	}
	if (data[0] == receiveAction.MY_SCORE) {
		const score = bytesToInt(data[1], data[2], data[3], data[4]);
		let kills = 0;
		if (data.length > 5) {
			kills = bytesToInt(data[5], data[6]);
		}
		scoreStatTarget = score;
		realScoreStatTarget = score + kills * 500;
		console.log(`### score: ${realScoreStatTarget}, kills: ${kills}, blocks: ${score}`);
	}
	if (data[0] == receiveAction.MY_RANK) {
		myRank = bytesToInt(data[1], data[2]);
		myRankSent = true;
		updateStats();
	}
	if (data[0] == receiveAction.LEADERBOARD) {
		totalPlayers = bytesToInt(data[1], data[2]);
		updateStats();
		leaderboard = [];
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
			leaderboard.push({rank,name: thisPlayerName, score: thisPlayerScore});
			i = i + 5 + nameLen;
			rank++;
		}
		if (totalPlayers < 30 && doRefreshAfterDie) {
			throw new Error("This server is about to close, refresh to join a full server.");
		}
	}
	if (data[0] == receiveAction.MAP_SIZE) {
		mapSize = bytesToInt(data[1], data[2]);
		console.log(`<<< MAP_SIZE size:${mapSize}`);
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
			lastStatDeathType = data[17];
			let _lastStatKiller = "";
			switch (lastStatDeathType) {
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
		closedBecauseOfDeath = true;
		allowSkipDeathTransition = true;
		//show newsbox
		deathTransitionTimeout = setTimeout(function () {
			// resetAll();
			if (skipDeathTransition) {
				doTransition("", false, function () {
					onClose();
					resetAll();
				});
			} else {
				// console.log("before doTransition",isTransitioning);
				doTransition("GAME OVER", true, null, function () {
					onClose();
					resetAll();
				}, true);
				// console.log("after doTransition",isTransitioning);
			}
			deathTransitionTimeout = null;
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
		player = getPlayer(id);
		if (player.isMyPlayer) {
			const _myColorId = data[3];
		}
		player.skinBlock = data[3];
	}
	if (data[0] == receiveAction.READY) {
		playingAndReady = true;
		if (!isTransitioning) {
			isTransitioning = true;
		}
	}
	if (data[0] == receiveAction.PLAYER_HIT_LINE) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
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
		doRefreshAfterDie = true;
	}
	if (data[0] == receiveAction.PLAYER_HONK) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
		const time = data[3];
		player.doHonk(time);
	}
	if (data[0] == receiveAction.PONG) {
		const ping = Date.now() - lastPingTime;
		const thisDiff = Math.abs(ping - thisServerLastPing);
		thisServerDiffPing = Math.max(thisServerDiffPing, thisDiff);
		thisServerDiffPing = lerp(thisDiff, thisServerDiffPing, 0.5);
		thisServerAvgPing = lerp(thisServerAvgPing, ping, 0.5);
		thisServerLastPing = ping;
		lastPingTime = Date.now();
		waitingForPing = false;
	}
	if (data[0] == receiveAction.UNDO_PLAYER_DIE) {
		id = bytesToInt(data[1], data[2]);
		player = getPlayer(id);
		player.undoDie();
	}
	if (data[0] == receiveAction.TEAM_LIFE_COUNT) {
		const _currentLives = data[1];
		const _totalLives = data[2];
	}
}

//send a message to the websocket, returns true if successful
// deno-lint-ignore no-explicit-any
function wsSendMsg(action: sendAction, data?: any) {
	let utf8Array;
	if (!!ws && ws.readyState == WebSocket.OPEN) {
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
			ws.send(payload);
			return true;
		} catch (ex) {
			console.log("error sending message", action, data, array, ex);
		}
	}
	return false;
}

//basically like refreshing the page
function resetAll() {
	if (!!ws && ws.readyState == WebSocket.OPEN) {
		ws.close();
	}
	ws = null;
	isConnecting = false;
	blocks = [];
	players = [];
	camPosSet = false;
	myPos = null;
	myRank = 0;
	scoreStat =
		scoreStatTarget =
		realScoreStat =
		realScoreStatTarget =
			25;
	myRankSent = false;
	totalPlayers = 0;
	playingAndReady = false;
	allowSkipDeathTransition = false;
	skipDeathTransition = false;
	hasReceivedChunkThisGame = false;
	if (doRefreshAfterDie) {
		location.reload();
	}
	sendDirQueue = [];
}



//called when a skinbutton is pressed
//add = -1 or 1 (increment/decrement)
//type = 0 (color) or 1 (pattern)


//engagement meter
let engagementIsPlaying = localStorage.engagementIsPlaying == "true";
let engagementLastPlayTime = localStorage.engagementLastPlayTime;
if (engagementLastPlayTime === undefined) {
	engagementLastPlayTime = Date.now();
}
let engagementLastNoPlayTime = 0;
let engagementLastChangeTime = localStorage.engagementLastChangeTime;
if (engagementLastChangeTime === undefined) {
	engagementLastChangeTime = Date.now();
}
let engagementValue = localStorage.engagementValue;
if (engagementValue === undefined) {
	engagementValue = 0.5;
} else {
	engagementValue = parseFloat(engagementValue);
}
function engagementSetIsPlaying(set: boolean) {
	const now = Date.now();
	if (set != engagementIsPlaying) {
		lsSet("engagementIsPlaying", String(set));
		engagementIsPlaying = set;
		let lastSet;
		if (set) {
			lastSet = engagementLastNoPlayTime;
		} else {
			lastSet = engagementLastPlayTime;
		}
		let setDiff = lastSet - engagementLastChangeTime;
		setDiff /= 20000;
		if (set) {
			//subtract non play time
			engagementValue = lerptt(engagementValue, 0, 0.01, setDiff / 100);
		} else {
			//add play time
			engagementValue = lerptt(engagementValue, 1, 0.01, setDiff);
		}
		lsSet("engagementValue", engagementValue);
		engagementLastChangeTime = now;
		lsSet("engagementLastChangeTime", now.toString());
	}
	if (set) {
		lsSet("engagementLastPlayTime", now.toString());
		engagementLastPlayTime = now;
	} else {
		engagementLastNoPlayTime = now;
	}
}


//remove blocks that are too far away from the camera and are likely
//to be seen without an updated state
function removeBlocksOutsideViewport(pos: number[]) {
	for (i = blocks.length - 1; i >= 0; i--) {
		const block = blocks[i];
		if (
			block.x < pos[0] - VIEWPORT_RADIUS * 2 ||
			block.x > pos[0] + VIEWPORT_RADIUS * 2 ||
			block.y < pos[1] - VIEWPORT_RADIUS * 2 ||
			block.y > pos[1] + VIEWPORT_RADIUS * 2
		) {
			blocks.splice(i, 1);
		}
	}
}

//gets color object for a player skin id
function getColorForBlockSkinId(id : number) {
	switch (id) {
		case 0:
			return colors.red;
		case 1:
			return colors.red2;
		case 2:
			return colors.pink;
		case 3:
			return colors.pink2;
		case 4:
			return colors.purple;
		case 5:
			return colors.blue;
		case 6:
			return colors.blue2;
		case 7:
			return colors.green;
		case 8:
			return colors.green2;
		case 9:
			return colors.leaf;
		case 10:
			return colors.yellow;
		case 11:
			return colors.orange;
		case 12:
			return colors.gold;
		default:
			return {
				brighter: "#000000",
				darker: "#000000",
				slightlyBrighter: "#000000",
			};
	}
}

//apply camera transformations on a canvas
//canvasTransformType is a global that determines what
//transformation should be used

function lerp(a: number, b: number, t: number) {
	return a + t * (b - a);
}

//inverse lerp
function iLerp(a: number, b: number, t: number) {
	return (t - a) / (b - a);
}

//fixed lerp, calls lerp() multiple times when having a lower framerate
function lerpt(a: number, b: number, t: number) {
	return lerptt(a, b, t, deltaTime / 16.6666);
}

//lerps between a and b over t, where tt is the amount of times that lerp should becalled
function lerptt(a:number, b: number, t: number, tt: number) {
	const newT = 1 - Math.pow(1 - t, tt);
	return lerp(a, b, newT);
}

//lerps an array

//clamp
function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}


//returns random item from array

//limits a value between -1 and 1 without clamping,
//v will gradually move towards 1/-1 but will never actually reach it

//updates the stats in the bottom left corner
function updateStats() {
	if (myRank > totalPlayers && myRankSent) {
		totalPlayers = myRank;
	} else if ((totalPlayers < myRank) || (myRank === 0 && totalPlayers > 0)) {
		myRank = totalPlayers;
	}
}

//fills an area, if array is not specified it defaults to blocks[]
function fillArea(x: number, y: number, w:number, h:number, type: number, pattern: number, array?: Block[], isEdgeChunk = false) {
	const defaultArray = array === undefined;
	if (defaultArray) {
		array = blocks;
	}

	if (pattern === undefined) {
		pattern = 0;
	}

	let x2 = x + w;
	let y2 = y + h;
	if (myPos !== null && defaultArray) {
		x = Math.max(x, Math.round(myPos[0]) - VIEWPORT_RADIUS);
		y = Math.max(y, Math.round(myPos[1]) - VIEWPORT_RADIUS);
		x2 = Math.min(x2, Math.round(myPos[0]) + VIEWPORT_RADIUS);
		y2 = Math.min(y2, Math.round(myPos[1]) + VIEWPORT_RADIUS);
	}

	for (let i = x; i < x2; i++) {
		for (let j = y; j < y2; j++) {
			const block = getBlock(i, j, array);
			//let thisType = applyPattern(type, pattern, i, j);
			block.setBlockId(type, isEdgeChunk ? false : Math.random() * 400);
		}
	}
}

//orders two positions so that pos1 is in the top left and pos2 in the bottom right
function orderTwoPos(pos1: number[], pos2: number[]) {
	const x1 = Math.min(pos1[0], pos2[0]);
	const y1 = Math.min(pos1[1], pos2[1]);
	const x2 = Math.max(pos1[0], pos2[0]);
	const y2 = Math.max(pos1[1], pos2[1]);
	return [[x1, y1], [x2, y2]];
}

//starts the transition
//reverseOnHalf: start playing backwords once it is showing the title
//callback1: callback fired once the transition is full screen for the first time
//callback2: fired when full screen for the second time, only shown when reverseOnHalf = true
// deno-lint-ignore no-explicit-any
function doTransition(..._args: any[]) {
}

function doSkipDeathTransition() {
	if (allowSkipDeathTransition) {
		if (deathTransitionTimeout !== null) {
			clearTimeout(deathTransitionTimeout);
			deathTransitionTimeout = null;
			onClose();
			doTransition("", false, function () {
				resetAll();
			});
		}
		skipDeathTransition = true;
	}
}

//random number between 0 and 1 using a seed

//moves (lerp) drawPos to the actual player position
function moveDrawPosToPos(player: Player) {
	// let xDist = Math.abs(player.pos[0] - player.drawPos[0]);
	// let yDist = Math.abs(player.pos[1] - player.drawPos[1]);
	let target = null;
	if (player.isDead && !player.deathWasCertain) {
		target = player.uncertainDeathPosition;
	} else {
		target = player.pos;
	}
	player.drawPos[0] = lerpt(player.drawPos[0], target[0], 0.23);
	player.drawPos[1] = lerpt(player.drawPos[1], target[1], 0.23);
}

//move pos along dir with offset
function movePos(pos: number[], dir: number, offset: number) {
	switch (dir) {
		case 0:
			pos[0] += offset;
			break;
		case 1:
			pos[1] += offset;
			break;
		case 2:
			pos[0] -= offset;
			break;
		case 3:
			pos[1] -= offset;
			break;
	}
}

const dtCaps = [0, 6.5, 16, 33, 49, 99];
function getDtCap(index: number) {
	return dtCaps[clamp(index, 0, dtCaps.length - 1)];
}

function loop(timeStamp: number) {
	let i, lastTrail;
	const realDeltaTime = timeStamp - (prevTimeStamp ?? 0);
	if (realDeltaTime > lerpedDeltaTime) {
		lerpedDeltaTime = realDeltaTime;
	} else {
		lerpedDeltaTime = lerpt(lerpedDeltaTime, realDeltaTime, 0.05);
	}

	if (realDeltaTime < lerp(getDtCap(currentDtCap), getDtCap(currentDtCap - 1), 0.9)) {
		gainedFrames.push(Date.now());
		while (gainedFrames.length > 190) {
			if (Date.now() - gainedFrames[0] > 10000) {
				gainedFrames.splice(0, 1);
			} else {
				currentDtCap--;
				gainedFrames = [];
				currentDtCap = clamp(currentDtCap, 0, dtCaps.length - 1);
				break;
			}
		}
	}

	if (realDeltaTime > lerp(getDtCap(currentDtCap), getDtCap(currentDtCap + 1), 0.05)) {
		missedFrames.push(Date.now());
		gainedFrames = [];
		while (missedFrames.length > 5) {
			if (Date.now() - missedFrames[0] > 5000) {
				missedFrames.splice(0, 1);
			} else {
				currentDtCap++;
				missedFrames = [];
				currentDtCap = clamp(currentDtCap, 0, dtCaps.length - 1);
				break;
			}
		}
	}

	deltaTime = realDeltaTime + totalDeltaTimeFromCap;
	prevTimeStamp = timeStamp;

	if (deltaTime < getDtCap(currentDtCap) && localStorage.dontCapFps != "true") {
		totalDeltaTimeFromCap += realDeltaTime;
	} else {
		totalDeltaTimeFromCap = 0;
		//draw blocks
		if(myPos)
		for(let i = 0; i < 5; i++){
			for(let j = 0; j < 5; j++){
				let block=getBlock(myPos[0]-2+j,myPos[1]-2+i).currentBlock;
				if(block >= 2){
					block=(block-2)%SKIN_BLOCK_COUNT+2; // Ignore pattern information 
				}
				surroundings[5*i+j]=block;
			}
		}

		//players
		let offset = deltaTime * GLOBAL_SPEED;
		for (let playerI = 0; playerI < players.length; playerI++) {
			const player = players[playerI];

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

			moveDrawPosToPos(player);

			//test if player should be dead
			let playerShouldBeDead = false;
			if (
				player.drawPos[0] <= 0 || player.drawPos[1] <= 0 || player.drawPos[0] >= mapSize - 1 ||
				player.drawPos[1] >= mapSize - 1
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
				myPos = [player.pos[0], player.pos[1]];
				if (camPosSet) {
					camPos[0] = lerpt(camPos[0], player.pos[0], 0.03);
					camPos[1] = lerpt(camPos[1], player.pos[1], 0.03);
				} else {
					camPos = [player.pos[0], player.pos[1]];
					camPosSet = true;
				}

				if (myNextDir != player.dir) {
					// console.log("myNextDir != player.dir (",myNextDir,"!=",player.dir,")");
					const horizontal = player.dir === 0 || player.dir == 2;
					//only change when currently traveling horizontally and new dir is not horizontal
					//or when new dir is horizontal but not currently traveling horizontally
					if (changeDirAtIsHorizontal != horizontal) {
						let changeDirNow = false;
						const currentCoord = player.pos[horizontal ? 0 : 1];
						if (player.dir === 0 || player.dir == 1) { //right & down
							if (changeDirAt && changeDirAt < currentCoord) {
								changeDirNow = true;
							}
						} else {
							if (changeDirAt && changeDirAt > currentCoord) {
								changeDirNow = true;
							}
						}
						if (changeDirNow && changeDirAt) {
							const newPos: Position = [player.pos[0], player.pos[1]];
							const tooFarTraveled = Math.abs(changeDirAt - currentCoord);
							newPos[horizontal ? 0 : 1] = changeDirAt;
							changeMyDir(myNextDir, newPos);
							movePos(player.pos, player.dir, tooFarTraveled);
						}
					}
				}
			}

			// drawPlayer(ctx, player, timeStamp);
		}

		//change dir queue
		if (sendDirQueue.length > 0) {
			const thisDir = sendDirQueue[0];
			if (
				Date.now() - thisDir.addTime > 1.2 / GLOBAL_SPEED || // older than '1.2 blocks travel time'
				sendDir(thisDir.dir, true) // senddir call was successful
			) {
				sendDirQueue.shift(); //remove item
			}
		}
		//corner stats
		scoreStat = lerpt(scoreStat, scoreStatTarget, 0.1);
		realScoreStat = lerpt(realScoreStat, realScoreStatTarget, 0.1);



		engagementSetIsPlaying(playingAndReady && (Date.now() - lastSendDirTime) < 20000);

		//debug info
		if (localStorage.drawDebug == "true") {
			const _avg = Math.round(thisServerAvgPing);
			const _last = Math.round(thisServerLastPing);
			const _diff = Math.round(thisServerDiffPing);
		}

	}

	// if my position confirmation took too long
	const clientSideSetPosPassed = Date.now() - lastMyPosSetClientSideTime;
	const clientSideValidSetPosPassed = Date.now() - lastMyPosSetValidClientSideTime;
	const serverSideSetPosPassed = Date.now() - lastMyPosServerSideTime;
	// console.log(clientSideSetPosPassed, clientSideValidSetPosPassed, serverSideSetPosPassed);
	if (
		clientSideValidSetPosPassed > WAIT_FOR_DISCONNECTED_MS &&
		serverSideSetPosPassed - clientSideSetPosPassed > WAIT_FOR_DISCONNECTED_MS && !myPlayer?.isDead
	) {
		throw new Error('It seems you are disconnected.');
	}

	const maxPingTime = waitingForPing ? 10000 : 5000;
	if (ws !== null && Date.now() - lastPingTime > maxPingTime) {
		lastPingTime = Date.now();
		if (wsSendMsg(sendAction.PING)) {
			waitingForPing = true;
		}
	}

}

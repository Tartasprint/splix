export type Position = [number, number];

//move pos along dir with offset
export function movePos(pos: number[], dir: number, offset: number) {
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

export const enum Direction {
    Right = 0,
    Down = 1,
    Left = 2,
    Up = 3,
    Pause = 4,
}

export class Player {
    id: number;
    pos: number[];
    drawPos: number[];
    drawPosSet: boolean;
    serverPos: Position;
    dir: number;
    isMyPlayer: boolean;
    isDead: boolean;
    deathWasCertain: boolean;
    didUncertainDeathLastTick: boolean;
    isDeadTimer: number;
    uncertainDeathPosition: number[];
    deadAnimParts: number[];
    deadAnimPartsRandDist: number[];
    moveRelativeToServerPosNextFrame: boolean;
    lastServerPosSentTime: number;
    honkTimer: number;
    honkMaxTime: number;
    trails: { trail: Position[], vanishTimer: number,}[];
    name: string;
    skinBlock: number;
    lastBlock: null;
    hasReceivedPosition: boolean;
    // deno-lint-ignore no-explicit-any
    hitLines: {pos: Position, vanishTimer: number, color: any}[];
    serverDir: Direction;
    constructor(id: number) {
        this.id = id;
		this.pos = [0, 0];
		this.drawPos = [-1, -1],
		this.drawPosSet = false,
		this.serverPos = [0, 0],
		this.dir = 0,
		this.isMyPlayer = id === 0,
		this.isDead = false,
		this.deathWasCertain = false,
		this.didUncertainDeathLastTick = false,
		this.isDeadTimer = 0,
		this.uncertainDeathPosition = [0, 0];
        this.deadAnimParts = [],
		this.deadAnimPartsRandDist = [];
		this.moveRelativeToServerPosNextFrame = false, //if true, lastServerPosSentTime will be used instead of deltatime for one frame
		this.lastServerPosSentTime = 0,
		this.honkTimer = 0,
		this.honkMaxTime = 0,
		this.trails = [],
		this.name = "",
		this.skinBlock = 0,
		this.lastBlock = null,
		this.hasReceivedPosition = false;
		this.hitLines = [];
        this.serverDir = Direction.Pause;
    }
    die(deathWasCertain?: boolean) {
        deathWasCertain = !!deathWasCertain;
        if (this.isDead) {
            this.deathWasCertain = deathWasCertain || this.deathWasCertain;
        } else {
            if (deathWasCertain || !this.didUncertainDeathLastTick) {
                if (!deathWasCertain) {
                    this.didUncertainDeathLastTick = true;
                    this.uncertainDeathPosition = [this.pos[0], this.pos[1]];
                }
                this.isDead = true;
                this.deathWasCertain = deathWasCertain;
                this.deadAnimParts = [0];
                this.isDeadTimer = 0;
                let prev = 0;
                while (true) {
                    prev += Math.random() * 0.4 + 0.5;
                    if (prev >= Math.PI * 2) {
                        this.deadAnimParts.push(Math.PI * 2);
                        break;
                    }
                    this.deadAnimParts.push(prev);
                    this.deadAnimPartsRandDist.push(Math.random());
                }
            }
        }
    }
    undoDie() {
        this.isDead = false;
    }
    
    // deno-lint-ignore no-explicit-any
    addHitLine(pos: Position, color: any) {
        this.hitLines.push({
            pos: pos,
            vanishTimer: 0,
            color: color,
        });
    }
    doHonk(_time: number) {
        // TARTA: Called on honking !
    }
}


export class Block
{
    x: number;
    y: number;
    currentBlock: number;
    nextBlock: number;
    animDirection: number;
    animProgress: number;
    animDelay: number;
    lastSetTime: number;
    constructor(x: number,y: number){
        this.x = x,
        this.y = y,
        this.currentBlock = -1,
        this.nextBlock = -1,
        this.animDirection = 0,
        this.animProgress = 0,
        this.animDelay = 0,
        this.lastSetTime = Date.now();
    }
    //changes the blockId with optional animatino
    //animateDelay defaults to 0
    //if animateDelay === false, don't do any animation at all
    // deno-lint-ignore no-explicit-any
    setBlockId(blockId: number, animateDelay?: any) {
        this.lastSetTime = Date.now();
        if (animateDelay === false) {
            this.currentBlock = this.nextBlock = blockId;
            this.animDirection = 0;
            this.animProgress = 1;
        } else {
            if (animateDelay === undefined) {
                animateDelay = 0;
            }
            this.animDelay = animateDelay;

            const isCurrentBlock = blockId == this.currentBlock;
            const isNextBlock = blockId == this.nextBlock;

            if (isCurrentBlock && isNextBlock) {
                if (this.animDirection == -1) {
                    this.animDirection = 1;
                }
            }

            if (isCurrentBlock && !isNextBlock) {
                this.animDirection = 1;
                this.nextBlock = this.currentBlock;
            }

            if (!isCurrentBlock && isNextBlock) {
                if (this.animDirection == 1) {
                    this.animDirection = -1;
                }
            }

            if (!isCurrentBlock && !isNextBlock) {
                this.nextBlock = blockId;
                this.animDirection = -1;
            }
        }
    }
}

export const enum receiveAction {
	UPDATE_BLOCKS= 1, // Legacy, useless
	PLAYER_POS= 2,
	FILL_AREA= 3,
	SET_TRAIL= 4,
	PLAYER_DIE= 5,
	CHUNK_OF_BLOCKS= 6,
	REMOVE_PLAYER= 7,
	PLAYER_NAME= 8,
	MY_SCORE= 9,
	MY_RANK= 10,
	LEADERBOARD= 11,
	MAP_SIZE= 12,
	YOU_DED= 13,
	MINIMAP= 14,
	PLAYER_SKIN= 15,
	EMPTY_TRAIL_WITH_LAST_POS= 16,
	READY= 17,
	PLAYER_HIT_LINE= 18,
	REFRESH_AFTER_DIE= 19,
	PLAYER_HONK= 20,
	PONG= 21,
	UNDO_PLAYER_DIE= 22,
	TEAM_LIFE_COUNT= 23,
};


export enum sendAction {
	UPDATE_DIR = 1,
	SET_USERNAME= 2,
	SKIN= 3,
	READY= 4,
	REQUEST_CLOSE= 5,
	HONK= 6,
	PING= 7,
	REQUEST_MY_TRAIL= 8,
	MY_TEAM_URL= 9,
	SET_TEAM_USERNAME= 10,
	VERSION= 11,
	PATREON_CODE= 12,
}
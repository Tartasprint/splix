export const GLOBAL_SPEED = 0.006;
export const VIEWPORT_RADIUS = 30;
export const WAIT_FOR_DISCONNECTED_MS = 1000;
export const SKIN_BLOCK_COUNT = 13;

export const colors = {
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

//gets color object for a player skin id
export function getColorForBlockSkinId(id : number) {
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

export const dtCaps = [0, 6.5, 16, 33, 49, 99];
export function getDtCap(index: number) {
	return dtCaps[clamp(index, 0, dtCaps.length - 1)];
}

export function lerp(a: number, b: number, t: number) {
	return a + t * (b - a);
}

//inverse lerp
export function iLerp(a: number, b: number, t: number) {
	return (t - a) / (b - a);
}



//lerps between a and b over t, where tt is the amount of times that lerp should becalled
export function lerptt(a:number, b: number, t: number, tt: number) {
	const newT = 1 - Math.pow(1 - t, tt);
	return lerp(a, b, newT);
}


//clamp
export function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

//orders two positions so that pos1 is in the top left and pos2 in the bottom right
export function orderTwoPos(pos1: number[], pos2: number[]) {
	const x1 = Math.min(pos1[0], pos2[0]);
	const y1 = Math.min(pos1[1], pos2[1]);
	const x2 = Math.max(pos1[0], pos2[0]);
	const y2 = Math.max(pos1[1], pos2[1]);
	return [[x1, y1], [x2, y2]];
}
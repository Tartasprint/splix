COLORS = {
    "grey": {
		"BG": "#3a342f",
		"brighter": "#4e463f",
		"darker": "#2d2926",
		"diagonalLines": "#c7c7c7",
	},
	"red": {
		"brighter": "#a22929",
		"darker": "#7b1e1e",
		"slightlyBrighter": "#af2c2c",
		"pattern": "#8c2222",
		"patternEdge": "#631717",
		"boundsDark": "#420707",
		"boundsBright": "#4c0808",
	},
	"red2": {
		"brighter": "#E3295E",
		"darker": "#B3224B",
		"slightlyBrighter": "#F02B63",
		"pattern": "#CC2554",
		"patternEdge": "#9C1C40",
	},
	"pink": {
		"brighter": "#A22974",
		"darker": "#7A1F57",
		"pattern": "#8A2262",
		"patternEdge": "#5E1743",
		"slightlyBrighter": "#B02C7E",
	},
	"pink2": {
		"brighter": "#7D26EF",
		"darker": "#5E1DBA",
		"pattern": "#6A21D1",
		"patternEdge": "#4C1896",
		"slightlyBrighter": "#882DFF",
	},
	"purple": {
		"brighter": "#531880",
		"darker": "#391058",
		"pattern": "#4b1573",
		"patternEdge": "#3b115a",
		"slightlyBrighter": "#5a198c",
	},
	"blue": {
		"brighter": "#27409c",
		"darker": "#1d3179",
		"pattern": "#213786",
		"patternEdge": "#1b2b67",
		"slightlyBrighter": "#2a44a9",
	},
	"blue2": {
		"brighter": "#3873E0",
		"darker": "#2754A3",
		"pattern": "#2F64BF",
		"patternEdge": "#1F4587",
		"slightlyBrighter": "#3B79ED",
	},
	"green": {
		"brighter": "#2ACC38",
		"darker": "#1C9626",
		"pattern": "#24AF30",
		"patternEdge": "#178220",
		"slightlyBrighter": "#2FD63D",
	},
	"green2": {
		"brighter": "#1e7d29",
		"darker": "#18561f",
		"pattern": "#1a6d24",
		"patternEdge": "#14541c",
		"slightlyBrighter": "#21882c",
	},
	"leaf": {
		"brighter": "#6a792c",
		"darker": "#576325",
		"pattern": "#5A6625",
		"patternEdge": "#454F1C",
		"slightlyBrighter": "#738430",
	},
	"yellow": {
		"brighter": "#d2b732",
		"darker": "#af992b",
		"pattern": "#D1A932",
		"patternEdge": "#B5922B",
		"slightlyBrighter": "#e6c938",
	},
	"orange": {
		"brighter": "#d06c18",
		"darker": "#ab5a15",
		"pattern": "#AF5B16",
		"patternEdge": "#914A0F",
		"slightlyBrighter": "#da7119",
	},
	"gold": {
		"brighter": "#F6B62C",
		"darker": "#F7981B",
		"pattern": "#DC821E",
		"patternEdge": "#BD6B0E",
		"slightlyBrighter": "#FBDF78",
		"bevelBright": "#F9D485",
	},
}

def getColorForBlockSkinId(id):
	match (id):
		case 0:
			return COLORS["red"]
		case 1:
			return COLORS["red2"]
		case 2:
			return COLORS["pink"]
		case 3:
			return COLORS["pink2"]
		case 4:
			return COLORS["purple"]
		case 5:
			return COLORS["blue"]
		case 6:
			return COLORS["blue2"]
		case 7:
			return COLORS["green"]
		case 8:
			return COLORS["green2"]
		case 9:
			return COLORS["leaf"]
		case 10:
			return COLORS["yellow"]
		case 11:
			return COLORS["orange"]
		case 12:
			return COLORS["gold"]
		case _:
			return {
				"brighter": "#000000",
				"darker": "#000000",
				"slightlyBrighter": "#000000",
			}
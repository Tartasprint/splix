//stackoverflow.com/a/18729931/3625298
export function toUTF8Array(str: string) {
	const utf8 = [];
	for (let i = 0; i < str.length; i++) {
		let charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
		} else if (charcode < 0xd800 || charcode >= 0xe000) {
			utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
		} // surrogate pair
		else {
			i++;
			// UTF-16 encodes 0x10000-0x10FFFF by
			// subtracting 0x10000 and splitting the
			// 20 bits of 0x0-0xFFFFF into two halves
			charcode = 0x10000 + (((charcode & 0x3ff) << 10) |
				(str.charCodeAt(i) & 0x3ff));
			utf8.push(
				0xf0 | (charcode >> 18),
				0x80 | ((charcode >> 12) & 0x3f),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f),
			);
		}
	}
	return utf8;
}

//http://stackoverflow.com/a/7124052/3625298
export function htmlEscape(str: string) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

//stackoverflow.com/a/22373135/3625298
// http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

/* utf.js - UTF-8 <=> UTF-16 convertion
 *
 * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */

export function Utf8ArrayToStr(array: Uint8Array) {
    let out, i, c;
	let char2, char3;

	out = "";
	const len = array.length;
	i = 0;
	while (i < len) {
		c = array[i++];
		switch (c >> 4) {
			case 0:
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
				// 0xxxxxxx
				out += String.fromCharCode(c);
				break;
			case 12:
			case 13:
				// 110x xxxx   10xx xxxx
				char2 = array[i++];
				out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
				break;
			case 14:
				// 1110 xxxx  10xx xxxx  10xx xxxx
				char2 = array[i++];
				char3 = array[i++];
				out += String.fromCharCode(
					((c & 0x0F) << 12) |
						((char2 & 0x3F) << 6) |
						((char3 & 0x3F) << 0),
				);
				break;
		}
	}

	return out;
}

export function bytesToInt(...args: number[]) {
	let integer = 0;
	let multiplier = 0;
	for (let i = args.length - 1; i >= 0; i--) {
		const thisArg = args[i];
		integer = (integer | (((thisArg & 0xff) << multiplier) >>> 0)) >>> 0;
		multiplier += 8;
	}
	return integer;
}

export function intToBytes(integer: number, byteCount: number) {
	const bytes = [];
	for (let i = 0; i < byteCount; i++) {
		const byte = integer & 0xff;
		bytes[byteCount - i - 1] = byte;
		integer = (integer - byte) / 256;
	}
	return bytes;
}

export function parseTimeToString(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds - (hours * 3600)) / 60);
	seconds = seconds - (hours * 3600) - (minutes * 60);
	if (hours <= 0) {
		const secondsS = seconds == 1 ? "" : "s";
		if (minutes <= 0) {
			return seconds + " second" + secondsS;
		} else {
			const minutesS = minutes == 1 ? "" : "s";
			return minutes + " minute" + minutesS + " and " + seconds + " second" + secondsS;
		}
	} else {
        let s_hours: string = hours.toString();
		if (hours < 10) s_hours = "0" + s_hours;
        let s_minutes: string = minutes.toString();
		if (minutes < 10) s_minutes = "0" + s_minutes;
        let s_seconds: string = seconds.toString();
		if (seconds < 10) s_seconds = "0" + s_seconds;
		return s_hours + ":" + s_minutes + ":" + s_seconds;
	}
}

export function parseQuery(url: string) {
	const startIndex = url.indexOf("?");
	if (startIndex < 0) {
		return {};
	}
	const queryString = url.substr(startIndex + 1);
	const queryItems = queryString.split("&");
	const query: Record<string,string> = {};
	for (let i = 0; i < queryItems.length; i++) {
		const split = queryItems[i].split("=");
		if (split.length == 2) {
			query[split[0]] = split[1];
		}
	}
	return query;
}
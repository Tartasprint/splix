let selected_server: any = null;
export function initServerSelection() {
	const _endPoint = "https://splix.io/gameservers";
	
    selected_server = [
		{"displayName":"US West","endpoint":"wss://sfo.splix.io/2","playerCount":3,"official":true},
		{"displayName":"Europe","endpoint":"wss://fra.splix.io/2","playerCount":7,"official":true},
		{"displayName":"Drawing","endpoint":"wss://nyc2.splix.io/2","playerCount":1},
		{"displayName":"US East","endpoint":"wss://nyc3.splix.io/1","playerCount":27,"official":true,"recommended":true}][0];
}

export function getSelectedServer() {
	// deno-lint-ignore no-constant-condition
	return true ? selected_server.endpoint : "ws://localhost:8080/gameserver";
}
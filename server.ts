let ids: number[] = [];

const carte = new Uint8Array(256*256);

function get_new_id(): number{
  const id =  Math.max(0,...ids)+1;
  ids.push(id);
  return id;
}

Deno.serve((req) => {

    if (req.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 501 });
    }
  
    const { socket, response } = Deno.upgradeWebSocket(req);
  
    const id = get_new_id();
    socket.addEventListener("open", () => {
      console.log(`client ${id} connected!`);
      socket.send(id.toString());
    });
  
    socket.addEventListener("message", (event) => {
      if (event.data === "carte") {
        socket.send(carte);
      }
    });

    socket.addEventListener('close', (event) => {
      console.log(`client ${id} disconnected!`);
      ids.splice(ids.indexOf(id),1);
    })
  
    return response;
  });
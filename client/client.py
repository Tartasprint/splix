import asyncio
import websockets
import json
import threading
import pygame
import collections
import colors
import pprint

intercom = collections.deque(maxlen=1)
stop = False # Controls communication loop
running = True # Controls pygame loop

async def communication():
	n=0
	uri = "ws://localhost:7979"
	try:
		async with websockets.connect(uri) as websocket:
			await websocket.send("p")
			async for message in websocket:
				if stop: return
				intercom.append(message)
				surroundings=json.loads(message)
				#print("RECEPT")
				n+=1
				if n < 50:
					await websocket.send('p')
				elif n==50:
					await websocket.send('u')
				elif n==54:
					await websocket.send('p')
				elif False:
					N=(n-50)
					if N%(2*4) == 0:
						await websocket.send('uldru'[(N//(2*4))%5])
	finally:
		running=False

def start_communication(loop):
	global running
	try:
		loop.run_until_complete(communication())
	finally:
		running=False






if __name__ == "__main__":
	loop = asyncio.get_event_loop()
	future = loop.create_future()
	thread = threading.Thread(target=start_communication, args=(loop,))
	thread.start()

	pygame.init()
	pygame.fastevent.init()

	# screen dimensions
	HEIGHT = 420
	WIDTH = 420

	# set up the drawing window
	screen = pygame.display.set_mode([WIDTH, HEIGHT])

	color = pygame.Color('blue')
	radius = 30
	x = int(WIDTH/2)
	state=None

	n=0
	# run until the user asks to quit
	while running:
		n+=1
		# did the user close the window
		for event in pygame.fastevent.get():
			if event.type == pygame.QUIT:
				running = False
		try:
			state=intercom.pop()
			state=json.loads(state)
			if state == "": state = None
		except: pass
		x = (x + 1) % (WIDTH - radius * 2) + radius
		# fill the background with white
		screen.fill((0,0,0))

		if state is not None:
			if n%10000==0:
				# printing for debug
				print(state['pos'])
			for x in range(21):
				for y in range(21):
					color = state["blocks"][21*x+y]
					if color == 0: # edge
						color = colors.COLORS["red"]["boundsDark"]
					elif color == 1:
						color = colors.COLORS["grey"]["brighter"]
					elif color >=2:
						color = colors.getColorForBlockSkinId((color-2)%13)["brighter"]
					else:
						color = "#000000"
					color=pygame.Color(color)
					pygame.draw.rect(screen, color, pygame.Rect(y*20+2,x*20+2,16,16))
			for x in range(21):
				for y in range(21):
					color = state["trails"][21*x+y]
					if color >= 0:
						color = pygame.Color(colors.getColorForBlockSkinId(color)["darker"])
						pygame.draw.circle(screen, color,(x*20+10,y*20+10), 5)
		# flip the display
		pygame.display.flip()
	
	stop = True
	thread.join()
	pygame.quit()


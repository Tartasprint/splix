
import asyncio
import websockets
import json
import pygame
import collections
import client.colors as colors
import time
from client.fix_sleep import sleep
import threading
import os
import tensorflow as tf
import numpy


ACTION_SPACE = "udlrpw"

class NeuralIntercom():
	def __init__(self) -> None:
		self.intercom = None
		self.received=0
		self.dead = False
		self.stats = [0,0,0,0,0]
		self.blocks = 0
		self.kills = 0
	def push(self,v):
		v = json.loads(v)
		if v == '': return
		if self.dead:
			return
		self.dead = v['dying'] > 0
		self.kills = v['kill_score']
		self.blocks = v['block_score']
		self.intercom = v
		self.received+=1
	def pop(self):
		if self.intercom is not None:
			r=self.intercom,self.received
			self.stats[min(self.received,4)]+=1
			self.received=0
			return r
		else:
			return None


class Env:
	def __init__(self, model, maxsteps, epsilon, logging=False, gui=False, time_errors=collections.deque(maxlen=100)) -> None:
		self.uri = "ws://hercule.local:7979"
		self.steps = []
		self.model = model
		self.model.get_layer(index=0).reset_state()
		self.maxsteps = maxsteps
		self.epsilon = epsilon
		self.total_reward=0
		self.pause_counter=0
		self.step_counter = 0
		self.intercom = collections.deque(maxlen=1)
		self.neural_intercom = NeuralIntercom()
		self.communicating = True # Controls communication loop
		self.interfacing = True # Controls pygame loop
		self.logging = logging
		self.gui=gui
		self.time_errors = time_errors
		self.death = 0
	def log(self,*args):
		if self.logging:
			print(*args)
	async def start_communication(self):
		self.log('START COM')
		async with websockets.connect(self.uri) as websocket:
			try:
				ready = await websocket.recv() == 'READY'
			except (websockets.ConnectionClosedError,websockets.ConnectionClosedOK):
				self.interfacing = False
				self.communicating = False
				return
			if not ready:
				self.interfacing = False
				self.communicating = False
				return
			else:
				self.log('CONNECTED')
			await asyncio.gather(self.send_loop(websocket),self.receive_loop(websocket))
			self.log('DISCONNECTED')
			self.interfacing=False
			try:
				await websocket.close()
			except websockets.ConnectionClosed: pass

	async def send_loop(self,websocket: websockets.WebSocketClientProtocol):
		score=25
		await sleep(0.350)
		try:
			await websocket.send('p')
		except (websockets.ConnectionClosedError,websockets.ConnectionClosedOK):
			self.log('ENDED 71')
			self.communicating=False
			return
		last=time.time()
		last_kill=-1
		kill_score=0
		while self.communicating or self.neural_intercom.dead:
			r=self.neural_intercom.pop()
			if r is None:
				await asyncio.sleep(0)
				continue
			state,_missed_frames=r
			self.log("MISSED:",_missed_frames)
			newscore=state['kill_score']*500+state['block_score']
			newkills=state['kill_score']-kill_score
			kill_score += newkills
			if newkills > 0:
				last_kill = len(self.steps)
				print('Kills',newkills)
			if 500*newkills != newscore-score:
				print("Blocks",newscore-score-500*newkills)
			blocks=tf.constant(state["blocks"], dtype=tf.float32, shape=(21,21))
			trails=tf.constant(state["trails"], dtype=tf.float32, shape=(21,21))
			players=tf.constant(state["players"], dtype=tf.float32, shape=(21,21))
			vision=tf.stack([blocks,trails,players],axis=2)
			vision=tf.reshape(vision,(1,1,1323))
			print('\nBARZOG',newscore, newscore-score)
			if(newscore-score)>0:
				print()
			reward=(newscore-score)*10
			
			if state['dying'] > 0: self.death=state['dying']

			if state['dying'] == 1: # killed by player
				reward -=100
			if state['dying'] == 2: # killed by wall
				reward -=1000
			if state['dying'] == 3: #killed by yourself
				reward -=100
			if (last_kill >= 0 and len(self.steps) - last_kill <= 10) and  (
				state['dying'] == 3 or newkills < 0 # undo last kill if it was suicide or fake (due to lag correction)
			):
				if last_kill < len(self.steps):
					self.steps[last_kill][-3]-=5000
					self.total_reward -= 5000
					if last_kill > 0:
						self.steps[last_kill-1][-1]-=500
						self.total_reward -= 500
					last_kill = -1 # do not count twice
			reward -=0.1 # No improve is lose			
			if len(self.steps) > 0:
				if self.steps[-1][1] == 4:
					reward -=1
					self.pause_counter += 1
				if newscore-score > 0 and len(self.steps) > 1: # more diffuse score
					self.steps[-2][-3]+=newscore-score
					self.total_reward +=newscore-score
				self.steps[-1][-1] = state['dying'] > 0
				self.steps[-1][-2] = tf.identity(vision)
				self.steps[-1][-3] = reward
			score=newscore
			self.total_reward +=reward
			if self.neural_intercom.dead:
				self.communicating = False
				self.interfacing = False
				print('ENDED DEAD'.ljust(20))
				return
			if(reward<=0):
				self.step_counter +=1
				if self.step_counter > self.maxsteps:
					print("ENDED TOO LONG".ljust(20))
					self.communicating = False
					self.interfacing = False
					return
			else:
				self.step_counter = 0
			y=tf.reshape(self.model.predict([vision], verbose=self.logging)[0],(6))
			yagent=tf.argmax(y).numpy()
			yeps = numpy.random.randint(0,len(ACTION_SPACE))
			if numpy.random.random() > self.epsilon:
				y=yagent
				self.log('yagent')
			else:
				y=yeps
				self.log('yeps')
			action=ACTION_SPACE[y]
			new=time.time()
			time_errors = self.time_errors
			time_offset=sum(time_errors)/float(len(time_errors)) if len(time_errors) > 10 else 0
			self.steps.append([tf.identity(vision),y,0,tf.identity(vision),False])
			if new-last < 0.166+time_offset:
				self.log('A',0.166+time_offset-new+last)
				await sleep(0.166+time_offset-new+last)
			try:
				await websocket.send(action)
			except (websockets.ConnectionClosedError, websockets.ConnectionClosedOK):
				self.communicating=False
				self.interfacing=False
				print('END L121'.ljust(20))
				return
			# prev, action, reward, new_state, done
			new = time.time()
			error = 0.166-new+last
			self.log('ZE',error,'ZO',time_offset)
			time_errors.append(error+time_offset)
			print('Looped. Action:', y, '; Time:', str(int((new-last)*1000)).rjust(9), end='\n' if not self.logging else '\n')
			last=new
		if not self.logging: print()
		self.log("SENDING DONE")

	async def receive_loop(self,websocket: websockets.WebSocketClientProtocol):
		while self.communicating:
			self.log('YAY')
			try:
				message = await websocket.recv()
			except (websockets.ConnectionClosedError,websockets.ConnectionClosedOK):
				self.communicating=False
				self.interfacing = False
				self.log('END 138')
				return
			self.intercom.append(message)
			self.neural_intercom.push(message)
			if self.neural_intercom.dead:
				self.communicating = False
				self.interfacing = False
				self.log('END 145')

	def pygame_interface(self):
		pygame.init()
		pygame.fastevent.init()

		# screen dimensions
		HEIGHT= 420
		WIDTH = 420

		# set up the drawing window
		screen = pygame.display.set_mode([WIDTH, HEIGHT])

		color = pygame.Color('blue')
		radius = 30
		x = int(WIDTH/2)
		state=None

		n=0
		last = time.time()
		# run until the user asks to quit
		while self.interfacing and self.communicating:
			new=time.time()
			time.sleep(max(0,0.083-new+last))
			print('Last', last-new)
			last=new
			n+=1
			# did the user close the window
			for event in pygame.fastevent.get():
				if event.type == pygame.QUIT:
					self.interfacing = False
			try:
				newstate=self.intercom.pop()
				newstate=json.loads(newstate)
				if newstate != "": 
					state = newstate
			except IndexError: pass
			x = (x + 1) % (WIDTH - radius * 2) + radius
			# fill the background with white
			screen.fill((0,0,0))

			if state is not None:
				if n%10000==0:
					# printing for debug
					self.log(state['pos'])
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
						pygame.draw.rect(screen, color, pygame.Rect(x*20+2,y*20+2,16,16))
				for x in range(21):
					for y in range(21):
						color = state["trails"][21*x+y]
						if color >= 0:
							color = pygame.Color(colors.getColorForBlockSkinId(color)["darker"])
							pygame.draw.circle(screen, color,(x*20+10,y*20+10), 5)
				for x in range(21):
					for y in range(21):
						color = state["players"][21*x+y]
						if color >= 0:
							color = pygame.Color(colors.getColorForBlockSkinId(color)["darker"])
							pygame.draw.rect(screen, pygame.Color('#ffffff'), pygame.Rect(x*20+5,y*20+5,10,10))
							pygame.draw.rect(screen, color, pygame.Rect(x*20+6,y*20+6, 8, 8))
			else:
				self.log("STATE IS NONE")
			# flip the display
			pygame.display.flip()
		
		self.communicating = False
		self.log('END 217')
		pygame.quit()

	async def run(self):
		beg=time.time()
		try:
			async with asyncio.TaskGroup() as tg:
				tg.create_task(self.start_communication())
				if self.gui:
					tg.create_task(asyncio.to_thread(self.pygame_interface))
		except KeyboardInterrupt:
			self.log('QUITTING...')
			self.interfacing=False
			self.communicating=False
		end=time.time()
		self.log('Ran:',end-beg,'s', '\tStats:', self.neural_intercom.stats)
		normal_tot_reward = -0.1*(len(self.steps)+1)-self.pause_counter+11*(self.neural_intercom.blocks-25)+5500*self.neural_intercom.kills
		if   self.death == 1: normal_tot_reward -=  100
		elif self.death == 2: normal_tot_reward -= 1000
		elif self.death == 3:
			normal_tot_reward -= 5500
			normal_tot_reward -= 100
		buggy = abs(self.total_reward-normal_tot_reward) > 10
		if buggy:
			print('BUGGY')
			print('Calc', normal_tot_reward)
			print('Got', self.total_reward)
			print('Steps', len(self.steps))
			print('Pauses', self.pause_counter)
			print('Blocks', self.neural_intercom.blocks)
			print('Kills', self.neural_intercom.kills)
			print('Death', self.death)
		return self.steps,self.total_reward,self.neural_intercom.stats,self.pause_counter, buggy

if __name__ == '__main__':
	asyncio.run
	self.log(len(Env(create_model(),200,1).run()))
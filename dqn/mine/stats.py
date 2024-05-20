import numpy as np

from dqn.mine.modified_tensorboard import ModifiedTensorBoard
class Stats:
    def __init__(self, every, tensorboard: ModifiedTensorBoard):
        self._board=tensorboard
        self._every=every
        self._compile=0
        self.missed_stats = np.zeros(5)
        self.steps = 0
        self.rewards = []
    def aggregate(self,other: 'Stats'):
        self.missed_stats += other.missed_stats
        self.steps += other.steps
        self.rewards.extend(other.rewards)
    def put_experience(self,missed_stats,steps,reward):
        self.missed_stats += np.array(missed_stats)
        self.steps += len(steps)
        self.rewards.append(reward)
    def compile(self,epsilon):
        if self._compile%self._every == 0:
            data = {
                'reward_avg': sum(self.rewards)/self._every,
                'reward_min':min(self.rewards),
                'reward_max':max(self.rewards),
                'epsilon':epsilon,
                'connection_quality':np.dot(self.missed_stats/np.sum(self.missed_stats),np.array([1,-1,-4,-9,-16])),
                'steps_avg':self.steps/self._every,
                }
            self._board.update_stats(**data)
            self.clear()
    def clear(self):
        self.missed_stats = np.zeros(5)
        self.steps = 0
        self.rewards.clear()
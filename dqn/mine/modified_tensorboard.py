import tensorflow as tf
import os

def dict_mean(dicts:list[dict]):
    counts = {}
    vals = {}
    for d in dicts:
        for k,v in d.items():
            if k not in counts:
                counts[k]=1
                vals[k]=v
            else:
                counts[k]+=1
                vals[k]+=v
    avgs = {}
    for k in counts:
        avgs[k]=vals[k]/counts[k]
    return avgs

class ModifiedTensorBoard(tf.keras.callbacks.TensorBoard):

    # Overriding init to set initial step and writer (we want one log file for all .fit() calls)
    def __init__(self,model_name, **kwargs):
        super().__init__(**kwargs)
        self.step = 1
        self.writer = tf.summary.create_file_writer(self.log_dir)
        self._log_write_dir = os.path.join(self.log_dir, model_name)
        self._my_very_own_logs_tarta = []


    def write_on_i_want(self):
        self.update_stats(**dict_mean(self._my_very_own_logs_tarta))
        self._my_very_own_logs_tarta = []

    # Overrided, saves logs with our step number
    # (otherwise every .fit() will start writing from 0th step)
    def on_epoch_end(self, epoch, logs=None):
        self._my_very_own_logs_tarta.append(logs)

    # Overrided
    # We train for one batch only, no need to save anything at epoch end
    def on_batch_end(self, batch, logs=None):
        pass

    # Overrided, so won't close writer
    def on_train_end(self, _):
        pass

    def on_train_batch_end(self, batch, logs=None):
        pass

    # Custom method for saving own metrics
    # Creates writer, writes custom metrics and closes writer
    def update_stats(self, **stats):
        self._write_logs(stats, self.step)

    def _write_logs(self, logs, index):
        with self.writer.as_default():
            for name, value in logs.items():
                tf.summary.scalar(name, value, step=index)
                self.writer.flush()
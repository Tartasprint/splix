from collections import deque
from time import sleep as time_sleep
from time import time
from asyncio import get_running_loop

errors = deque(maxlen=20)
errors.append(0)

async def sleep(sleep_for: float) -> None:
    """An asyncio sleep.

    On Windows this achieves a better granularity than asyncio.sleep

    Args:
        sleep_for (float): Seconds to sleep for.
    """
    bef=time()
    offset = -sum(errors)/float(len(errors))
    print("B",sleep_for+offset) 
    await get_running_loop().run_in_executor(None, time_sleep, max(0,sleep_for+offset))
    aft=time()
    error=aft-bef-sleep_for
    print("E",error)
    errors.append(error+offset)
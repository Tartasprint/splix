import asyncio
from concurrent.futures import ProcessPoolExecutor
import time
def printing(msg):
    for n in range(10):
        print(msg,n)
        time.sleep(1)

async def main():
    with ProcessPoolExecutor() as pool:
        await asyncio.gather(
            asyncio.get_running_loop().run_in_executor(pool,printing,'hello'),
            asyncio.get_running_loop().run_in_executor(pool,printing,'hi'),
        )
    print('finished')

if __name__ == '__main__':
    asyncio.run(main())
from minio import Minio

client = Minio("192.168.1.133:9004",
    access_key="GbuMXO4jtXDUnzZCQzTl",
    secret_key="9DVaBW8gHXyUHam0vQpeIpVV2DbJNq2cs3HNBMDA",
    secure=False,
)
bucket_name = "splix"
found = client.bucket_exists(bucket_name)
if not found:
    client.make_bucket(bucket_name)
    print("Created bucket", bucket_name)
else:
    print("Bucket", bucket_name, "already exists")

import pickle
import io
obj=pickle.dumps('BANANA')

client.put_object(
    bucket_name='splix',
    object_name='EXPERIENCE001',
    data=io.BytesIO(obj),
    length=len(obj),
)
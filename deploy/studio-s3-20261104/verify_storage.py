import json,hashlib,urllib.request,urllib.error
from pathlib import Path
import boto3
from botocore.config import Config
v=json.loads(Path('/data/shared-services/seaweedfs/credentials.json').read_text())
def client(who):
 c=v[who];return boto3.client('s3',endpoint_url='https://s3.fanapi.cc',aws_access_key_id=c['accessKey'],aws_secret_access_key=c['secretKey'],region_name='us-east-1',config=Config(signature_version='s3v4',s3={'addressing_style':'path'}))
s=client('admin');bucket='midcode-media'
if bucket not in [b['Name'] for b in s.list_buckets()['Buckets']]:s.create_bucket(Bucket=bucket)
s.put_bucket_cors(Bucket=bucket,CORSConfiguration={'CORSRules':[{'AllowedOrigins':['https://image.midcode.cc','https://midcode.cc','https://ai.midcode.cc'],'AllowedMethods':['GET','HEAD'],'AllowedHeaders':['*'],'ExposeHeaders':['ETag','Content-Length','Content-Range','Accept-Ranges'],'MaxAgeSeconds':600}]})
s=client('studio');body=b'MIDCODE S3 storage verification\n';key='verification/storage-check.txt'
s.put_object(Bucket=bucket,Key=key,Body=body,ContentType='text/plain')
url=s.generate_presigned_url('get_object',Params={'Bucket':bucket,'Key':key},ExpiresIn=60)
assert urllib.request.urlopen(url).read()==body
req=urllib.request.Request(url,headers={'Range':'bytes=0-6','Origin':'https://image.midcode.cc'})
r=urllib.request.urlopen(req);assert r.status==206 and r.read()==body[:7];assert r.headers['Access-Control-Allow-Origin']=='https://image.midcode.cc'
try:urllib.request.urlopen('https://s3.fanapi.cc/'+bucket+'/'+key);raise AssertionError('anonymous access')
except urllib.error.HTTPError as e:assert e.code==403
s.delete_object(Bucket=bucket,Key=key)
print('S3_PRIVATE_PUT_GET_RANGE_CORS_TLS_PASS')

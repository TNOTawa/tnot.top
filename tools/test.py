import requests

# 定义请求的URL
url = "http://tool.bitefu.net/jiari/"

# 定义请求参数
params = {
    'd': '2023-10-01',  # 替换为你想查询的日期，格式为YYYY-MM-DD
    'back': 'json',     # 可选返回格式，默认为json
    'info': 1           # 可选，返回详细信息
}

# 发送GET请求
response = requests.get(url, params=params)

# 打印返回的内容
if response.status_code == 200:
    print(response.json())
else:
    print(f"请求失败，状态码：{response.status_code}")
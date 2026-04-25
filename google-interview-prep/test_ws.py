import asyncio
import websockets
import httpx
import json

async def test():
    print("Fetching token...")
    async with httpx.AsyncClient() as client:
        res = await client.post("http://127.0.0.1:8000/api/live/token", json={"interview_type": "coding"})
        data = res.json()
    print("Token response acquired.", data["model"])
    
    wsUrl = f"{data['websocket_url']}?access_token={data['token']}"
    
    async with websockets.connect(wsUrl) as ws:
        print("WS Opened")
        configMessage = {
            "setup": {
                "model": f"models/{data['model']}"
            }
        }
        await ws.send(json.dumps(configMessage))
        
        while True:
            msg = await ws.recv()
            print("Msg:", msg[:100])
            break

asyncio.run(test())

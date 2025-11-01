"""
Python Client for Terminal API Service
pip install requests websocket-client
"""

import requests
import websocket
import json
import threading
import time

class TerminalAPIClient:
    def __init__(self, api_url, api_key):
        self.api_url = api_url
        self.api_key = api_key
        self.headers = {'X-API-Key': api_key}
    
    def create_session(self, user_id, metadata=None):
        response = requests.post(
            f'{self.api_url}/sessions',
            headers=self.headers,
            json={'userId': user_id, 'metadata': metadata or {}}
        )
        response.raise_for_status()
        return response.json()
    
    def kill_session(self, session_id):
        response = requests.delete(
            f'{self.api_url}/sessions/{session_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def connect_terminal(self, ws_url, on_output=None, on_ready=None):
        ws = None
        
        def on_message(ws_obj, message):
            data = json.loads(message)
            if data['type'] == 'ready':
                print('Terminal ready!')
                if on_ready:
                    on_ready(ws_obj)
            elif data['type'] == 'output':
                if on_output:
                    on_output(data['data'])
                else:
                    print(data['data'], end='', flush=True)
        
        def on_open(ws_obj):
            print('WebSocket connected')
            ws_obj.send(json.dumps({'type': 'start', 'cols': 80, 'rows': 24}))
        
        ws = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_open=on_open
        )
        
        thread = threading.Thread(target=ws.run_forever)
        thread.daemon = True
        thread.start()
        
        return ws
    
    def send_input(self, ws, data):
        ws.send(json.dumps({'type': 'input', 'data': data}))


# Usage Example
def main():
    client = TerminalAPIClient(
        api_url='http://localhost:4000/api',
        api_key='your-secret-api-key'
    )
    
    session = client.create_session('python-user', {'app': 'python-client'})
    print(f"Session: {session['sessionId']}")
    
    def on_ready(ws):
        client.send_input(ws, 'echo "Hello from Python!"\n')
        time.sleep(1)
        client.send_input(ws, 'pwd\n')
    
    ws = client.connect_terminal(session['wsUrl'], on_ready=on_ready)
    time.sleep(5)
    
    client.kill_session(session['sessionId'])
    ws.close()


if __name__ == '__main__':
    main()
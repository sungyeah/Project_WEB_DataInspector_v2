from flask import Flask, request, render_template
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/event", methods=["POST"])
def receive_event():
    data = request.json
    token = data.get("probe_token")
    print("event_room:", token)
    if not token:
        return {"status": "fail", "reason": "Invalid TOKEN"}, 400

    # token을 방 이름으로 사용
    socketio.emit('new_event', data, room=token)
    return {"status": "ok"}

@socketio.on("join")
def handle_join(data):
    token = data.get("token")
    print("join_room:", token)
    if token:
        join_room(token)
        emit("joined", {"room": token})

if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5002)

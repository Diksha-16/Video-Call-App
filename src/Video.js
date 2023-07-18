//sets the main communication window
// 1. React -> complete react library
// 2. Component -> converts javascript classs to a react component
import React, { Component } from "react";
// 3. sockets client
import io from "socket.io-client";
// 4. for generating fake default username
import faker from "faker";
import { IconButton, Badge, Input, Button } from "@material-ui/core";
import VideocamIcon from "@material-ui/icons/Videocam";
import VideocamOffIcon from "@material-ui/icons/VideocamOff";
import MicIcon from "@material-ui/icons/Mic";
import MicOffIcon from "@material-ui/icons/MicOff";
import ScreenShareIcon from "@material-ui/icons/ScreenShare";
import StopScreenShareIcon from "@material-ui/icons/StopScreenShare";
import CallEndIcon from "@material-ui/icons/CallEnd";
import ChatIcon from "@material-ui/icons/Chat";
// 5. for sharing meet link by email
import { InlineShareButtons } from "sharethis-reactjs";

import { message } from "antd";
import "antd/dist/antd.css";

import { Row } from "reactstrap";
import Modal from "react-bootstrap/Modal";
import "bootstrap/dist/css/bootstrap.css";
import "./Video.css";

// 6. Lmao 3 UI Libraries in One Project: MaterialUI, Bootstrap, and Ant Design.

// 7. Sockets Backend Server URL
const server_url =
  process.env.NODE_ENV === "production"
    ? "https://video-call-bb3h.onrender.com/"
    : "http://localhost:4001";

// 8. Global Object to store participants information
var connections = {};

// 9. Stun Servers URL - needed for browser to browser connection establishment .i.e. to share joining information offers to each other to create webrtc connection
const peerConnectionConfig = {
  iceServers: [
    // { 'urls': 'stun:stun.services.mozilla.com' },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};
// 10. stores the socket object
var socket = null;
// 11. local user socket Id
var socketId = null;
// 12. no. of video elements
var elms = 0;

class Video extends Component {
  constructor(props) {
    super(props);
    // 13. to Manipute local video element
    this.localVideoref = React.createRef();
    // 14. audio or video perimission are granted or not.
    this.videoAvailable = false;
    this.audioAvailable = false;
    // 15. a object containing multiple states
    this.state = {
      // 16. is video on?
      video: false,
      // 17. is audio on?
      audio: false,
      // 18. is screen sharing on?
      screen: false,
      // 19. message modal
      showModal: false,
      // 20. screen permissions granted or not
      screenAvailable: false,
      messages: [],
      message: "",
      newmessages: 0,
      askForUsername: true,
      username: faker.internet.userName(),
    };
    connections = {};
    // before 21 and after 20.
    this.getPermissions();
  }
  // before 21 and after 20.
  getPermissions = async () => {
    try {
      await navigator.mediaDevices
        .getUserMedia({ video: true })
        .then(() => (this.videoAvailable = true))
        .catch(() => (this.videoAvailable = false));

      await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => (this.audioAvailable = true))
        .catch(() => (this.audioAvailable = false));

      if (navigator.mediaDevices.getDisplayMedia) {
        this.setState({ screenAvailable: true });
      } else {
        this.setState({ screenAvailable: false });
      }

      if (this.videoAvailable || this.audioAvailable) {
        navigator.mediaDevices
          .getUserMedia({
            video: this.videoAvailable,
            audio: this.audioAvailable,
          })
          .then((stream) => {
            window.localStream = stream;
            this.localVideoref.current.srcObject = stream;
          })
          .then((stream) => {})
          .catch((e) => console.log(e));
      }
    } catch (e) {
      console.log(e);
    }
  };
  // 22. set video, audio button states based on permissions granted
  //get local user media based on audio, video button
  //calls connectToSocketServer, getUserMedia function
  getMedia = () => {
    this.setState(
      {
        video: this.videoAvailable,
        audio: this.audioAvailable,
      },
      () => {
        this.getUserMedia();
        this.connectToSocketServer();
      }
    );
  };

  //36. if we have any one of audio/video is turned on, then get stream and send it to getUserMediaSucess function
  // otherwise turn off the track (a stream can contain multiple tracks)
  getUserMedia = () => {
    if (
      (this.state.video && this.videoAvailable) ||
      (this.state.audio && this.audioAvailable)
    ) {
      navigator.mediaDevices
        .getUserMedia({ video: this.state.video, audio: this.state.audio })
        .then(this.getUserMediaSuccess)
        .then((stream) => {})
        .catch((e) => console.log(e));
    } else {
      try {
        let tracks = this.localVideoref.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {}
    }
  };

  getUserMediaSuccess = (stream) => {
    //37a. turn off all previous running tracks of localStream
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }
    //37b. set new stream received from getUserMedia and assign it to localStream property of window object
    window.localStream = stream;
    //37c. set new stream recived from getUserMedia to localVideo element
    this.localVideoref.current.srcObject = stream;

    // 37d. send new stream infomation to all participants except local user
    for (let id in connections) {
      if (id === socketId) continue;

      connections[id].addStream(window.localStream);

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socket.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            );
          })
          .catch((e) => console.log(e));
      });
    }
    //37c. get all tracks of localStream and add function which will be called when this track is ended
    stream.getTracks().forEach(
      (track) =>
        // 37d. if a track (a track can cantain video, audio) of our localStream ends call this callback arrow function
        (track.onended = () => {
          //37e. set video/audio button state to false i.e. off.
          this.setState(
            {
              video: false,
              audio: false,
            },
            () => {
              // 37f. end all tracks of local video element
              try {
                let tracks = this.localVideoref.current.srcObject.getTracks();
                tracks.forEach((track) => track.stop());
              } catch (e) {
                console.log(e);
              }

              // 37g. make dummy stream and send updated stream to all participants
              let blackSilence = (...args) =>
                new MediaStream([this.black(...args), this.silence()]);
              window.localStream = blackSilence();
              this.localVideoref.current.srcObject = window.localStream;

              for (let id in connections) {
                connections[id].addStream(window.localStream);

                connections[id].createOffer().then((description) => {
                  connections[id]
                    .setLocalDescription(description)
                    .then(() => {
                      socket.emit(
                        "signal",
                        id,
                        JSON.stringify({
                          sdp: connections[id].localDescription,
                        })
                      );
                    })
                    .catch((e) => console.log(e));
                });
              }
            }
          );
        })
    );
  };

  // 38. if we have screenshare is turned on, then get stream and send it to getDislayMediaSuccess function
  // otherwise turn off the track (a stream can contain multiple tracks)
  getDislayMedia = () => {
    if (this.state.screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(this.getDislayMediaSuccess)
          .then((stream) => {})
          .catch((e) => console.log(e));
      }
    }
  };

  getDislayMediaSuccess = (stream) => {
    //39a. turn off all previous running tracks of localStream
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }
    //39b. set new stream received from getDisplayMedia and assign it to localStream property of window object
    window.localStream = stream;
    this.localVideoref.current.srcObject = stream;

    // 39c. send new stream infomation to all participants except local user
    for (let id in connections) {
      if (id === socketId) continue;

      connections[id].addStream(window.localStream);

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socket.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            );
          })
          .catch((e) => console.log(e));
      });
    }
    //39d. get all tracks of localStream and add function which will be called when this track is ended
    stream.getTracks().forEach(
      (track) =>
        //39e. set screen button state to false i.e. off.
        (track.onended = () => {
          this.setState(
            {
              screen: false,
            },
            () => {
              // 39f. end all tracks of local video element
              try {
                let tracks = this.localVideoref.current.srcObject.getTracks();
                tracks.forEach((track) => track.stop());
              } catch (e) {
                console.log(e);
              }
              // 39g. make dummy stream and send updated stream to all participants
              let blackSilence = (...args) =>
                new MediaStream([this.black(...args), this.silence()]);
              window.localStream = blackSilence();
              this.localVideoref.current.srcObject = window.localStream;

              this.getUserMedia();
            }
          );
        })
    );
  };

  //40. utility function for exchanging sdp, ice information
  //sdp and ice are two tech for same thing
  /*SDP is intended to be general purpose so that it can be used in a wide range of network environments and applications. However, it is not intended to support negotiation of session content or media encodings. For the latter, responsible is ICE.*/
  gotMessageFromServer = (fromId, message) => {
    var signal = JSON.parse(message);
    //40.a if information received is not send by local user
    if (fromId !== socketId) {
      //40.b if we receive others sdp, send our sdp to other
      if (signal.sdp) {
        connections[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              connections[fromId]
                .createAnswer()
                .then((description) => {
                  connections[fromId]
                    .setLocalDescription(description)
                    .then(() => {
                      socket.emit(
                        "signal",
                        fromId,
                        JSON.stringify({
                          sdp: connections[fromId].localDescription,
                        })
                      );
                    })
                    .catch((e) => console.log(e));
                })
                .catch((e) => console.log(e));
            }
          })
          .catch((e) => console.log(e));
      }

      if (signal.ice) {
        //40.b if we receive others ice, send our ice to other
        connections[fromId]
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.log(e));
      }
    }
  };

  //the layout of participants
  changeCssVideos = (main) => {
    let widthMain = main.offsetWidth;
    let minWidth = "30%";
    if ((widthMain * 30) / 100 < 300) {
      minWidth = "300px";
    }
    let minHeight = "40%";

    let height = String(100 / elms) + "%";
    let width = "";
    if (elms === 0 || elms === 1) {
      width = "100%";
      height = "100%";
    } else if (elms === 2) {
      width = "45%";
      height = "100%";
    } else if (elms === 3 || elms === 4) {
      width = "35%";
      height = "50%";
    } else {
      width = String(100 / elms) + "%";
    }

    let videos = main.querySelectorAll("video");
    for (let a = 0; a < videos.length; ++a) {
      videos[a].style.minWidth = minWidth;
      videos[a].style.minHeight = minHeight;
      videos[a].style.setProperty("width", width);
      videos[a].style.setProperty("height", height);
    }

    return { minWidth, minHeight, width, height };
  };
  // 23. connect the socket client to backend socket server
  // adds event listeners to socket object
  connectToSocketServer = () => {
    // 23a. connect to backend socket server
    socket = io.connect(server_url, { secure: true });
    //23b. event listener for "signal" event - when some data will be sent by server to client on "signal event"
    // it will be handled by gotMessageFromServer function
    socket.on("signal", this.gotMessageFromServer);
    //23c. event listener for "connect" event
    // code inside callback arrow function will be executed when connection is established
    socket.on("connect", () => {
      //23d. send url to server
      socket.emit("join-call", window.location.href);
      //23e. store socket id to socketId variable
      socketId = socket.id;
      //23f.  event listener for "chat-message" event - when some data will be sent by server to client on "signal" event
      // it will be handled by addMessage function
      socket.on("chat-message", this.addMessage);
      //23g. event listener for "user-left" event
      // code inside callback arrow function will be executed when  some data will be sent by server to client on "user-left" event
      socket.on("user-left", (id) => {
        //23h. find video element of user who left
        let video = document.querySelector(`[data-socket="${id}"]`);
        //23i. if video element is found
        if (video !== null) {
          //23k. decrement number of participants
          elms--;
          //23l. remove video element
          video.parentNode.removeChild(video);
          //23m. perform css transformations on main container element accordingly
          //main element contails all video elements
          let main = document.getElementById("main");
          this.changeCssVideos(main);
        }
      });
      //23n. event listener for "user-joined" event
      // code inside callback arrow function will be executed when  some data will be sent by server to client on "user-joined" event
      socket.on("user-joined", (id, clients) => {
        //23o. send connection request to all participants througth stun servers
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(
            peerConnectionConfig
          );
          //23p. response from stun servers that contains the information (local user ip address (allocated by ISP), etc) for established webrtc connection to other browser
          connections[socketListId].onicecandidate = function (event) {
            if (event.candidate != null) {
              //23q. if information is available send information to other browser using socket backend
              socket.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate })
              );
            }
          };

          //23r. assigning a function which will be called when the a audio/video stream will be recieved
          connections[socketListId].onaddstream = (event) => {
            //23s. find video element with this socketID
            var searchVidep = document.querySelector(
              `[data-socket="${socketListId}"]`
            );
            if (searchVidep !== null) {
              // 23t. if video element with this socketID already exists insert the stream

              searchVidep.srcObject = event.stream;
            } else {
              // 23u. if video element with this socketID not exists, create new and then insert the stream
              elms = clients.length;
              let main = document.getElementById("main");
              let cssMesure = this.changeCssVideos(main);

              let video = document.createElement("video");

              let css = {
                minWidth: cssMesure.minWidth,
                minHeight: cssMesure.minHeight,
                maxHeight: "100%",
                margin: "10px",
                borderStyle: "solid",
                borderColor: "#bdbdbd",
                objectFit: "fill",
              };
              for (let i in css) video.style[i] = css[i];

              video.style.setProperty("width", cssMesure.width);
              video.style.setProperty("height", cssMesure.height);
              video.setAttribute("data-socket", socketListId);
              video.srcObject = event.stream;
              video.autoplay = true;
              video.playsinline = true;

              main.appendChild(video);
            }
          };

          // 23v. if local user stream is available then send this stream to all participants
          if (window.localStream !== undefined && window.localStream !== null) {
            connections[socketListId].addStream(window.localStream);
          } else {
            // 23v. if local user stream is not available then send a dummy blank stream to all participants
            let blackSilence = (...args) =>
              new MediaStream([this.black(...args), this.silence()]);
            window.localStream = blackSilence();
            connections[socketListId].addStream(window.localStream);
          }
        });
        //23x. id -> socketId of user joined
        if (id === socketId) {
          for (let id2 in connections) {
            if (id2 === socketId) continue;

            try {
              connections[id2].addStream(window.localStream);
            } catch (e) {}
            // 23y. create webrtc connection offer with all other participants and send my joining info for webrtc connection
            connections[id2].createOffer().then((description) => {
              connections[id2]
                .setLocalDescription(description)
                .then(() => {
                  socket.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription })
                  );
                })
                .catch((e) => console.log(e));
              //23z. SDP example
              /*
				v=0
				o=alice 2890844526 2890844526 IN IP4 host.anywhere.com
				s=
				c=IN IP4 host.anywhere.com
				t=0 0
				m=audio 49170 RTP/AVP 0
				a=rtpmap:0 PCMU/8000
				m=video 51372 RTP/AVP 31
				a=rtpmap:31 H261/90000
				m=video 53000 RTP/AVP 32
				a=rtpmap:32 MPV/90000
				*/
            });
          }
        }
      });
    });
  };
  // 24. function for muting the audio
  silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };
  // 25. function for turning off video
  black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };
  // 26. turns the video on and off and requests user video/audio
  handleVideo = () =>
    this.setState({ video: !this.state.video }, () => this.getUserMedia());
  // 27. turns the audio on and off and requests user video/audio
  handleAudio = () =>
    this.setState({ audio: !this.state.audio }, () => this.getUserMedia());
  // 28. turns the screen share on and off and requests user screen media
  handleScreen = () =>
    this.setState({ screen: !this.state.screen }, () => this.getDislayMedia());
  // 29. ends the call, turn off all streams and moves to home screen
  handleEndCall = () => {
    try {
      let tracks = this.localVideoref.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {}
    window.location.href = "/";
  };
  //30. open chat modal
  openChat = () => this.setState({ showModal: true, newmessages: 0 });
  //31. close chat modal
  closeChat = () => this.setState({ showModal: false });
  //32. assign value of message input element to message variable
  handleMessage = (e) => this.setState({ message: e.target.value });
  //33. add new message to messages array and increment newmessages variable if local user is not sender
  addMessage = (data, sender, socketIdSender) => {
    this.setState((prevState) => ({
      messages: [...prevState.messages, { sender: sender, data: data }],
    }));
    if (socketIdSender !== socketId) {
      this.setState({ newmessages: this.state.newmessages + 1 });
    }
  };
  //32. assign value of username input element to username variable
  handleUsername = (e) => this.setState({ username: e.target.value });
  // 33. sends new chat message to server using chat-message event
  sendMessage = () => {
    socket.emit("chat-message", this.state.message, this.state.username);
    this.setState({ message: "", sender: this.state.username });
  };

  //34. copy meeting url to clipboard
  copyUrl = () => {
    let text = window.location.href;
    if (!navigator.clipboard) {
      let textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        message.success("Link copied to clipboard!");
      } catch (err) {
        message.error("Failed to copy");
      }
      document.body.removeChild(textArea);
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        message.success("Link copied to clipboard!");
      },
      () => {
        message.error("Failed to copy");
      }
    );
  };
  // 21. runs when the user clicks on connect on username screen
  // putting askForUsername flas to show meet screen instead of username screen
  // calling getMedia function
  connect = () =>
    this.setState({ askForUsername: false }, () => this.getMedia());
  // 35. checks if the local browser is chrome or not
  isChrome = function () {
    let userAgent = (navigator && (navigator.userAgent || "")).toLowerCase();
    let vendor = (navigator && (navigator.vendor || "")).toLowerCase();
    let matchChrome = /google inc/.test(vendor)
      ? userAgent.match(/(?:chrome|crios)\/(\d+)/)
      : null;
    // let matchFirefox = userAgent.match(/(?:firefox|fxios)\/(\d+)/)
    // return matchChrome !== null || matchFirefox !== null
    return matchChrome !== null;
  };

  render() {
    if (this.isChrome() === false) {
      return (
        <div
          style={{
            background: "white",
            width: "30%",
            height: "auto",
            padding: "20px",
            minWidth: "400px",
            textAlign: "center",
            margin: "auto",
            marginTop: "50px",
            justifyContent: "center",
          }}
        >
          <h1>Sorry, this works only with Google Chrome</h1>
        </div>
      );
    }
    var emailSubject = "Invitation to join meet";

    var emailContent = "Link to join: " + window.location.href;
    return (
      <div>
        {this.state.askForUsername === true ? (
          <div>
            <div
              style={{
                background: "white",
                width: "30%",
                height: "auto",
                padding: "20px",
                minWidth: "400px",
                textAlign: "center",
                margin: "auto",
                marginTop: "50px",
                justifyContent: "center",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontWeight: "bold",
                  paddingRight: "50px",
                  color: "#4b53bc",
                }}
              >
                Set your username
              </p>
              <Input
                placeholder="Username"
                value={this.state.username}
                onChange={(e) => this.handleUsername(e)}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={this.connect}
                style={{ margin: "20px" }}
              >
                Connect
              </Button>
            </div>

            <div
              style={{
                justifyContent: "center",
                textAlign: "center",
                paddingTop: "40px",
                paddingBottom: "70px",
              }}
            >
              <video
                id="my-video"
                ref={this.localVideoref}
                autoPlay
                muted
                style={{
                  transform: "scaleX(-1)",
                  borderStyle: "solid",
                  borderColor: "#bdbdbd",
                  objectFit: "fill",
                  width: "60%",
                  height: "30%",
                }}
              ></video>
            </div>
          </div>
        ) : (
          <div>
            <div
              className="btn-down"
              style={{
                backgroundColor: "whitesmoke",
                color: "whitesmoke",
                textAlign: "center",
                padding: "10px 0",
              }}
            >
              <IconButton
                style={{ color: "#424242" }}
                onClick={this.handleAudio}
              >
                {this.state.audio === true ? <MicIcon /> : <MicOffIcon />}
              </IconButton>
              <IconButton
                style={{ color: "#424242" }}
                onClick={this.handleVideo}
              >
                {this.state.video === true ? (
                  <VideocamIcon />
                ) : (
                  <VideocamOffIcon />
                )}
              </IconButton>
              <IconButton
                style={{ color: "#f44336" }}
                onClick={this.handleEndCall}
              >
                <CallEndIcon />
              </IconButton>
              {this.state.screenAvailable === true ? (
                <IconButton
                  style={{ color: "#424242" }}
                  onClick={this.handleScreen}
                >
                  {this.state.screen === true ? (
                    <ScreenShareIcon />
                  ) : (
                    <StopScreenShareIcon />
                  )}
                </IconButton>
              ) : null}

              <Badge
                badgeContent={this.state.newmessages}
                max={999}
                color="secondary"
                onClick={this.openChat}
              >
                <IconButton
                  style={{ color: "#424242" }}
                  onClick={this.openChat}
                >
                  <ChatIcon />
                </IconButton>
              </Badge>
            </div>

            <Modal
              show={this.state.showModal}
              onHide={this.closeChat}
              style={{ zIndex: "999999" }}
            >
              <Modal.Header closeButton>
                <Modal.Title>
                  <p style={{ color: "#4b53bc", fontWeight: "500" }}>Chat</p>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body
                style={{
                  overflow: "auto",
                  overflowY: "auto",
                  height: "400px",
                  textAlign: "left",
                }}
              >
                {this.state.messages.length > 0 ? (
                  this.state.messages.map((item, index) => (
                    <div key={index} style={{ textAlign: "left" }}>
                      <p style={{ wordBreak: "break-all", color: "black" }}>
                        <b>{item.sender}</b>: {item.data}
                      </p>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "black" }}>No message yet</p>
                )}
              </Modal.Body>
              <Modal.Footer className="div-send-msg">
                <Input
                  placeholder="Message"
                  value={this.state.message}
                  onChange={(e) => this.handleMessage(e)}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={this.sendMessage}
                >
                  Send
                </Button>
              </Modal.Footer>
            </Modal>

            <div className="container">
              <div style={{ paddingTop: "20px" }}>
                <Input value={window.location.href} disable="true"></Input>
                <Button
                  style={{
                    backgroundColor: "white",
                    color: "#4b53bc",
                    fontWeight: "600",
                    marginLeft: "20px",
                    width: "120px",
                    fontSize: "10px",
                  }}
                  onClick={this.copyUrl}
                >
                  Copy invite link
                </Button>

                <div style={{ height: "10px" }}></div>
                <InlineShareButtons
                  config={{
                    alignment: "center", // alignment of buttons (left, center, right)
                    color: "white", // set the color of buttons (social, white)
                    enabled: true, // show/hide buttons (true, false)
                    font_size: 13, // font size for the buttons
                    labels: "cta", // button labels (cta, counts, null)
                    language: "en", // which language to use (see LANGUAGES)
                    networks: [
                      // which networks to include (see SHARING NETWORKS)
                      "email",
                    ],
                    padding: 2, // padding within buttons (INTEGER)
                    radius: 4, // the corner radius on each button (INTEGER)
                    // show_total: true,
                    size: 30, // the size of each button (INTEGER)
                    // OPTIONAL PARAMETERS
                    url: "https://www.sharethis.com", // (defaults to current url)
                    image: "https://bit.ly/2CMhCMC", // (defaults to og:image or twitter:image)
                    description: "custom text", // (defaults to og:description or twitter:description)
                    title: "custom title", // (defaults to og:title or twitter:title)
                    message: emailContent, // (only for email sharing)
                    subject: emailSubject, // (only for email sharing)
                  }}
                />
              </div>

              <Row
                id="main"
                className="flex-container"
                style={{ margin: 0, padding: 0 }}
              >
                <video
                  id="my-video"
                  ref={this.localVideoref}
                  autoPlay
                  muted
                  style={{
                    borderStyle: "solid",
                    borderColor: "#bdbdbd",
                    margin: "10px",
                    objectFit: "fill",
                    width: "100%",
                    height: "100%",
                  }}
                ></video>
              </Row>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default Video;

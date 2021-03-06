// Uses https://github.com/webrtc/adapter
// https://www.html5rocks.com/en/tutorials/webrtc/infrastructure/

'use strict';

var Meeting = function (socketioHost) { 
    var exports = {};
    
    var _localStream;
    var _remoteStream;
    var _turnReady;
    var _pcConfig = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]};
    var _constraints = {video: true, audio:true};
    var _defaultChannel;
    var _privateAnswerChannel;
    var _offerChannel;
    var _pc;
    var _sendChannel;
    var _room;
    var _myID;
    var _onRemoteVideoCallback;
    var _onLocalVideoCallback;
	var _onJoinedRoomCallback;
	var _onNextFailedCallback;
    var _onChatMessageCallback;
    var _onChatReadyCallback;
    var _onChatNotReadyCallback;
    var _onParticipantHangupCallback;
    var _host = socketioHost;
    var _answer = false;
	var _offer = false;
	var _requestOpen = false;
	var _participantID;
	
    ////////////////////////////////////////////////
    // PUBLIC FUNCTIONS
    ////////////////////////////////////////////////
    
    function init(videoEnabled, micEnabled) {
	    _constraints = {video: videoEnabled, audio:micEnabled};
	     
		if (!_myID) {
            _myID = generateID();
            console.log('Generated ID: '+_myID);
        }

        // Open up a default communication channel
		_defaultChannel = initDefaultChannel();
		
		        
       // Get local media data
        if (!_localStream) {
            navigator.mediaDevices.getUserMedia(_constraints).then(handleUserMedia, handleUserMediaError);    
        }
		
        
        window.onbeforeunload = function(e) {
            _defaultChannel.emit('message',{type: 'bye', from:_myID, room:_room});
        }
	}
    
 	 /**
	 *
	 * Add callback function to be called when a chat message is available.
	 *
	 * @param name of the room to join
	 */   
    function joinRoom(name) { 
        _remoteStream = null;
        
        _room = name;       
        
        console.log('Request to join room '+ _room+ ' with _constraints: %j', _constraints);
        _defaultChannel.emit('join', {room:_room, from:_myID});
        
		// Open up a private communication channel
		_privateAnswerChannel = initPrivateChannel();
                
    }
    
	 /**
	 *
	 * Request next room
	 *
	 */
	function next() {
		console.log("Requesting next room...");
		if (_room) {
			console.log('Sending p2pbye message to '+_participantID+ ' for room '+_room);
			_privateAnswerChannel.emit('message', {from:_myID, type:'p2pbye', dest:_participantID, room: _room}); 
		}
		
		closeCurrentConnection();
        _onParticipantHangupCallback()
        
		_requestOpen = true;
        _defaultChannel.emit('next', {from:_myID, currentRoom:_room, hasLocalStream:(_localStream != null)});
    }
	
    
    /**
	 *
	 * Send a chat message to all channels.
	 *
	 * @param message String message to be send
	 */
    function sendChatMessage(message) {
	    console.log("Sending "+message)
		_sendChannel.send(message);
    }
    
	
	 /**
	 *
	 * enable/disable microphone availability.
	 *
	 */
    function enableMic(enable) {
		var tracks = _localStream.getTracks();
		for (var i = 0; i < tracks.length; i++) {
			if (tracks[i].kind=="audio") {
				tracks[i].enabled = enable;	
			}
		}
		
		_constraints.audio = enable;
	}
	
	 /**
	 *
	 * enable/disable video availability.
	 *
	 */
    function enableVideo(enable) {
		var tracks = _localStream.getTracks();
		for (var i = 0; i < tracks.length; i++) {
			if (tracks[i].kind=="video") {
				tracks[i].enabled = enable;	
			}
		}
		
		_constraints.video = enable;
	}
	
	
	/**
	 *
	 * Add callback function to be called when remote video is available.
	 *
	 * @param callback of type function(stream, participantID)
	 */
    function onRemoteVideo(callback) {
        _onRemoteVideoCallback = callback;
    }
    
	/**
	 *
	 * Add callback function to be called when local video is available.
	 *
	 * @param callback function of type function(stream)
	 */
    function onLocalVideo(callback) {
        _onLocalVideoCallback = callback;
    }
	
	/**
	 *
	 * Add callback function to be called when local peer joins a room.
	 *
	 * @param callback function of type function()
	 */
    function onJoinedRoom(callback) {
        _onJoinedRoomCallback = callback;
    }
    
    /**
	 *
	 * Add callback function to be called when we got an answer to our 'next' request saying there is no room available.
	 *
	 * @param callback function of type function()
	 */
    function onNextFailed(callback) {
        _onNextFailedCallback = callback;
    }
	
    /**
	 *
	 * Add callback function to be called when chat is available.
	 *
	 * @parama callback function of type function()
	 */
    function onChatReady(callback) {
	    _onChatReadyCallback = callback;
    }
    
    /**
	 *
	 * Add callback function to be called when chat is no more available.
	 *
	 * @parama callback function of type function()
	 */
    function onChatNotReady(callback) {
	    _onChatNotReadyCallback = callback;
    }
    
    /**
	 *
	 * Add callback function to be called when a chat message is available.
	 *
	 * @parama callback function of type function(message)
	 */
    function onChatMessage(callback) {
        _onChatMessageCallback = callback;
    }
    
    /**
	 *
	 * Add callback function to be called when a a participant left the conference.
	 *
	 * @parama callback function of type function(participantID)
	 */
    function onParticipantHangup(callback) {
	    _onParticipantHangupCallback = callback;
    }
    
    ////////////////////////////////////////////////
    // INIT FUNCTIONS
    ////////////////////////////////////////////////
    
    /**
	 *
	 * The default channel is '' and it’s the one Socket.IO clients connect to by default, and the one the server listens to by default.
	 *
	 * @return the socket
	 */
    function initDefaultChannel() {
        console.log("Initializing default channel");
        var defaultChannel = openSignalingChannel('');
        
		defaultChannel.on('log', function (array){
          console.log(array);
        });
		
        defaultChannel.on('created', function (room){
          console.log('Created room ' + room);
          _onJoinedRoomCallback();
        });

        defaultChannel.on('joined', function (room){
            console.log('This peer has joined room ' + room);
            defaultChannel.emit('message', {type:'newparticipant', from: _myID, room:_room});
			_onJoinedRoomCallback();
        });
        
        defaultChannel.on('message', function (message){
            console.log('Received message in default channel:', message);
            var partID = message.from;
            if (message.type === 'newparticipant' && message.from != _myID && message.room === _room) {
				// Open a new communication channel to the new participant
				console.log('Opening a new channel for offers to the new participant');
				_offerChannel = openSignalingChannel(_room);

				// Wait for answers (to offers) from the new participant
				_offerChannel.on('message', function (msg){
					if (msg.dest===_myID) {
						if (msg.type === 'answer' && !_answer && msg.room === _room) {
							console.log('Got answer from '+msg.from +' in offer channel');
							_answer = true;
							
							_pc.setRemoteDescription(new RTCSessionDescription(msg.snDescription),
															   setRemoteDescriptionSuccess, 
															   setRemoteDescriptionError);
						} else if (msg.type === 'candidate' && msg.room === _room) {
							var candidate = new RTCIceCandidate({sdpMLineIndex: msg.label, candidate: msg.candidate});
							console.log('Got ice candidate from '+msg.from +' in offer channel');
							_pc.addIceCandidate(candidate, addIceCandidateSuccess, addIceCandidateError);
						}
					}
				});

				// Send an offer to the new participant
				createOffer(partID);
            } else if (message.type === 'bye' && message.room === _room) {
                console.log('Bye received from '+ message.from+' for room '+message.room);
				console.log("Hanging up.");
				hangup(message.from);	
            }
        });
		
		defaultChannel.on('next', function (message){
            if (message.dest===_myID && _requestOpen) {
	            console.log('Got answer to next request: '+message.success);
	            if (message.success == true) {
		            console.log("Received new room "+message.room+' with participant: '+message.participant);
		            _requestOpen = false;
		            _participantID = message.participant;
					joinRoom(message.room);
	            } else {
		            console.log("Server couldn't find a free peer.");
		            _onNextFailedCallback();
	            }
            } 
            
            
        });
		
		
		return defaultChannel;
    }
      
    function initPrivateChannel() {
        // Open a private channel (namespace = _myID) to receive offers
        var privateAnswerChannel = openSignalingChannel(_room);

        console.log("Initialized private channel at namespace "+privateAnswerChannel.name);
        
        // Wait for offers or ice candidates
        privateAnswerChannel.on('message', function (message){
			console.log('Received message in private channel:', message);
            if (message.dest===_myID) {
                if(message.type === 'offer' && !_offer && message.room === _room) {
                    console.log('Got offer from '+message.from +' in private channel');
                    _offer = true;
                    var to = message.from;
                    createAnswer(message, _privateAnswerChannel, to);
                } else if (message.type === 'candidate' && message.room === _room) {
                    console.log('Got ice candidate from '+message.from +' in private channel');
                    var candidate = new RTCIceCandidate({sdpMLineIndex: message.label, candidate: message.candidate});
					_pc.addIceCandidate(candidate, addIceCandidateSuccess, addIceCandidateError);
                } else if (message.type === 'p2pbye' && message.room === _room) {
                    console.log('Got bye from '+message.from +' in private channel for room '+message.room);
                    closeCurrentConnection();
                    _onParticipantHangupCallback() ;
                }
            }
        });
		
		
		return privateAnswerChannel;
    }
    
    function requestTurn(turn_url) {
        var turnExists = false;
        for (var i in _pcConfig.iceServers) {
            if (_pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                turnExists = true;
                _turnReady = true;
                break;
            }
        }

        if (!turnExists) {
            console.log('Getting TURN server from ', turn_url);
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function(){
                if (xhr.readyState === 4 && xhr.status === 200) {
                    var turnServer = JSON.parse(xhr.responseText);
                     console.log('Got TURN server: ', turnServer);
                    _pcConfig.iceServers.push({
                        'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                        'credential': turnServer.password
                    });
                    _turnReady = true;
                }
            }
            xhr.open('GET', turn_url, true);
            xhr.send();
        }
    }

    
    ///////////////////////////////////////////
    // UTIL FUNCTIONS
    ///////////////////////////////////////////
    
    /**
	 *
	 * Call the registered _onRemoteVideoCallback
	 *
	 */
    function addRemoteVideo(stream, from) {
        // call the callback
        _onRemoteVideoCallback(stream, from);
    }


    /**
	 *
	 * Generates a random ID.
	 *
	 * @return a random ID
	 */
    function generateID() {
        var s4 = function() {
            return Math.floor(Math.random() * 0x10000).toString(16);
        };
        return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
    }

    
    ////////////////////////////////////////////////
    // COMMUNICATION FUNCTIONS
    ////////////////////////////////////////////////
    
    /**
	 *
	 * Connect to the server and open a signal channel using channel as the channel's name.
	 *
	 * @return the socket
	 */
    function openSignalingChannel(channel) {
        var namespace = _host + '/' + channel;
        var sckt = io.connect(namespace, {'forceNew': true });
        return sckt;
    }

    /**
	 *
	 * Send an offer to peer with id participantId
	 *
	 * @param participantId the participant's unique ID we want to send an offer
	 */
    function createOffer(participantId) {
        console.log('Creating offer for peer '+participantId);

        _pc = new RTCPeerConnection(_pcConfig);
        _pc.onicecandidate = handleIceCandidateAnswerWrapper(_offerChannel, participantId);
        _pc.onaddstream = handleRemoteStreamAdded(participantId); // .onaddstream or newer version: ontrack
        _pc.onremovestream = handleRemoteStreamRemoved; 
        _pc.addStream(_localStream);
        _pc.oniceconnectionstatechange = handleIceConnectionStateChangePC;

		try {
			// Reliable Data Channels not yet supported in Chrome
			_sendChannel = _pc.createDataChannel("sendDataChannel", {reliable: false});
			_sendChannel.onmessage = handleMessage;
			console.log('Created send data channel');
		} catch (e) {
			alert('Failed to create data channel. ' + 'You need Chrome M25 or later with RtpDataChannel enabled');
			console.log('createDataChannel() failed with exception: ' + e.message);
		}
		_sendChannel.onopen = handleSendChannelStateChange(participantId);
		_sendChannel.onclose = handleSendChannelStateChange(participantId);

        var onSuccess = function(participantId) {
            return function(sessionDescription) {
                var channel = _offerChannel;

                // Set Opus as the preferred codec in SDP if Opus is present.
                sessionDescription.sdp = preferOpus(sessionDescription.sdp);
                
                _pc.setLocalDescription(sessionDescription, setLocalDescriptionSuccess, setLocalDescriptionOfferError);  
                console.log('Sending offer to channel '+ channel.name);
                channel.emit('message', {snDescription: sessionDescription, from:_myID, type:'offer', dest:participantId, room:_room});        
            }
        }

        _pc.createOffer(onSuccess(participantId), handleCreateOfferError);  
    }

    function createAnswer(sdp, cnl, to) {
        console.log('Creating answer for peer '+to);
        _pc = new RTCPeerConnection(_pcConfig);
        _pc.onaddstream = handleIceCandidateAnswerWrapper(cnl, to);
        _pc.onaddstream = handleRemoteStreamAdded(to); // .onaddstream or newer version: ontrack
        _pc.onremovestream = handleRemoteStreamRemoved;
        _pc.addStream(_localStream);
        _pc.setRemoteDescription(new RTCSessionDescription(sdp.snDescription), setRemoteDescriptionSuccess, setRemoteDescriptionError);
        _pc.ondatachannel = gotReceiveChannel(to);
        _pc.oniceconnectionstatechange = handleIceConnectionStateChangePC;
        
        var onSuccess = function(channel) {
            return function(sessionDescription) {
                // Set Opus as the preferred codec in SDP if Opus is present.
                sessionDescription.sdp = preferOpus(sessionDescription.sdp);

                _pc.setLocalDescription(sessionDescription, setLocalDescriptionSuccess, setLocalDescriptionAnswerError); 
                console.log('Sending answer to channel '+ channel.name);
                channel.emit('message', {snDescription:sessionDescription, from:_myID,  type:'answer', dest:to, room:_room});
            }
        }

        _pc.createAnswer(onSuccess(cnl), handleCreateAnswerError);
    }

	function closeCurrentConnection() {		
		_room = null;	
		
		if (_pc) {
            console.log("Closing _pc");
            _pc.close();
		    _pc = null;
        }
        
        if (_sendChannel) {
            console.log("Closing _sendChannel");
            _sendChannel.close();
        }

        _remoteStream = null;
        _answer = false;
        _offer = false;
        _participantID = null;
	}
	
    function hangup(from) {
		closeCurrentConnection();
     
		_onParticipantHangupCallback();
    }


    ////////////////////////////////////////////////
    // HANDLERS
    ////////////////////////////////////////////////
    
    // SUCCESS HANDLERS

    function handleUserMedia(stream) {
        console.log('Adding local stream');
        _onLocalVideoCallback(stream);
        _localStream = stream;
		enableMic(_constraints.audio);
        enableVideo(_constraints.video);
        
		_defaultChannel.emit('ready', {from:_myID});
    }

    function handleIceConnectionStateChangePC(event) {
	    if (_pc) {
			console.log('ICE connection state change on PC:'+_pc.iceConnectionState);
	        if(_pc.iceConnectionState == 'disconnected') {
	            console.log('Disconnected on _pc');
	            _onParticipantHangupCallback();
	        } else if(_pc.iceConnectionState == 'failed') {
	            console.log('Failed on _pc');
	            _onParticipantHangupCallback();
	        }   
	    }
    }
    
    function handleRemoteStreamRemoved(event) {
        console.log('Remote stream removed. Event: ', event);
    }

/*
	// Only works with .ontrack
    function handleRemoteStreamAdded(from) {
	    return function(event) {
        	console.log(event.track.kind+' remote stream added from '+from);
		
            if (!_remoteStream) {
               _remoteStream = event.streams[0]; 
            }

            if (event.track.kind == "video") {
                addRemoteVideo(_remoteStream, from);
            }
            
        }
    }
*/

	function handleRemoteStreamAdded(from) {
	    return function(event) {
        	console.log('Remote stream added from '+from);
		
            if (!_remoteStream) {
               _remoteStream = event.stream; 
               addRemoteVideo(_remoteStream, from);
            }
            
        }
    }

    function handleIceCandidateAnswerWrapper(channel, to) {
        return function handleIceCandidate(event) {
            console.log('handleIceCandidate event');
            if (event.candidate) {
                channel.emit('message',
                        {type: 'candidate',
                        label: event.candidate.sdpMLineIndex,
                        id: event.candidate.sdpMid,
                        candidate: event.candidate.candidate,
                        from: _myID, 
                        dest:to,
                        room:_room}
                    );

            } else {
                console.log('End of candidates.');
            }
        }
    }

    function setLocalDescriptionSuccess() {}

    function setRemoteDescriptionSuccess() {}

    function addIceCandidateSuccess() {}

	function gotReceiveChannel(id) {
		return function(event) {
		  	console.log('Receive Channel Callback');
		  	_sendChannel = event.channel;
		  	_sendChannel.onmessage = handleMessage;
		  	_sendChannel.onopen = handleReceiveChannelStateChange(id);
		  	_sendChannel.onclose = handleReceiveChannelStateChange(id);
		  	
		  	// Needed for Safari/Temasys plugin. Safari doesn't call _sendChannel.onopen 
		  	var readyState = _sendChannel.readyState;
		  	var open = checkIfOpenChannel();
		  	enableMessageInterface(open);
	  	}
	}
	
	function handleMessage(event) {
	  	console.log('Received message: ' + event.data);
	  	_onChatMessageCallback(event.data);
	}
	
	function handleSendChannelStateChange(participantId) {
		return function() {
		  	var readyState = _sendChannel.readyState;
		  	console.log('Send channel state is: ' + readyState);
		  	
		  	// check if we have at least one open channel before we set hat ready to false.
		  	var open = checkIfOpenChannel();
		  	enableMessageInterface(open);
	  	}
	}
	
	function handleReceiveChannelStateChange(participantId) {
		return function() {
		  	var readyState = _sendChannel.readyState;
		  	console.log('Receive channel state is: ' + readyState);
		  	
		  	// check if we have at least one open channel before we set hat ready to false.
		  	var open = checkIfOpenChannel();
		  	enableMessageInterface(open);
	  	}
	}
	
	function checkIfOpenChannel() {
        return (_sendChannel.readyState == "open");
	}
	
	function enableMessageInterface(shouldEnable) {
		console.log('Enable message interface '+shouldEnable);
	    if (shouldEnable) {
			_onChatReadyCallback();
	  	} else {
	    	_onChatNotReadyCallback();
	  	}
	}
    
    // ERROR HANDLERS
    
    function handleCreateOfferError(event){
        console.log('createOffer() error: ', event);
    }

    function handleCreateAnswerError(event){
        console.log('createAnswer() error: ', event);
    }

    function handleUserMediaError(error){
        console.log('getUserMedia error: ', error);
    }

    function setLocalDescriptionAnswerError(error) {
        console.log('setLocalDescriptionAnswerError error: ', error);
    }

    function setLocalDescriptionOfferError(error) {
        console.log('setLocalDescriptionOfferError error: ', error);
    }
    
    function setRemoteDescriptionError(error) {
        console.log('setRemoteDescription error: ', error);
    }

    function addIceCandidateError(error) {}
    
    
    ////////////////////////////////////////////////
    // CODEC
    ////////////////////////////////////////////////

    // Set Opus as the default audio codec if it's present.
    function preferOpus(sdp) {
      var sdpLines = sdp.split('\r\n');
      var mLineIndex;
      // Search for m line.
      for (var i = 0; i < sdpLines.length; i++) {
          if (sdpLines[i].search('m=audio') !== -1) {
            mLineIndex = i;
            break;
          }
      }
      if (mLineIndex === null || mLineIndex === undefined) {
        return sdp;
      }

      // If Opus is available, set it as the default in m line.
      for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('opus/48000') !== -1) {
          var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
          if (opusPayload) {
            sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
          }
          break;
        }
      }

      // Remove CN in m line and sdp.
      sdpLines = removeCN(sdpLines, mLineIndex);

      sdp = sdpLines.join('\r\n');
      return sdp;
    }

    function extractSdp(sdpLine, pattern) {
      var result = sdpLine.match(pattern);
      return result && result.length === 2 ? result[1] : null;
    }

    // Set the selected codec to the first in m line.
    function setDefaultCodec(mLine, payload) {
      var elements = mLine.split(' ');
      var newLine = [];
      var index = 0;
      for (var i = 0; i < elements.length; i++) {
        if (index === 3) { // Format of media starts from the fourth.
          newLine[index++] = payload; // Put target payload to the first.
        }
        if (elements[i] !== payload) {
          newLine[index++] = elements[i];
        }
      }
      return newLine.join(' ');
    }

    // Strip CN from sdp before CN constraints is ready.
    function removeCN(sdpLines, mLineIndex) {
      var mLineElements = sdpLines[mLineIndex].split(' ');
      // Scan from end for the convenience of removing an item.
      for (var i = sdpLines.length-1; i >= 0; i--) {
        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
        if (payload) {
          var cnPos = mLineElements.indexOf(payload);
          if (cnPos !== -1) {
            // Remove CN payload from m line.
            mLineElements.splice(cnPos, 1);
          }
          // Remove CN line in sdp
          sdpLines.splice(i, 1);
        }
      }

      sdpLines[mLineIndex] = mLineElements.join(' ');
      return sdpLines;
    }
    

    ////////////////////////////////////////////////
    // EXPORT PUBLIC FUNCTIONS
    ////////////////////////////////////////////////
    exports.init            	=       init;
    exports.joinRoom            =       joinRoom;
	exports.next            	=       next;
    exports.enableMic 			= 		enableMic;
	exports.enableVideo 		= 		enableVideo;
    exports.onLocalVideo        =       onLocalVideo;
    exports.onRemoteVideo       =       onRemoteVideo;
	exports.onJoinedRoom		=		onJoinedRoom;
    exports.onChatReady 		= 		onChatReady;
    exports.onChatNotReady 		= 		onChatNotReady;
    exports.onChatMessage       =       onChatMessage;
    exports.onNextFailed		=		onNextFailed;
    exports.sendChatMessage     =       sendChatMessage;
    exports.onParticipantHangup =		onParticipantHangup;
    return exports;
    
};

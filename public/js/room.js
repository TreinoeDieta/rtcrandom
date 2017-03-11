'use strict';
var _meeting;
var _name = 'Stranger';
var _avatar = 1;
var _host = HOST_ADDRESS; // HOST_ADDRESS gets injected into room.ejs from the server side when it is rendered
var _allowNext = true;
var _chatReady = false;
var _typing = false;
var _hasRemoteVideo = false;

$(document).on('keydown', function(evt) {
	if (evt.keyCode == 27) {
		$('#next-button').addClass('activated');
	}
});
$(document).on('keyup', function(evt) {
	if (evt.keyCode == 27) {
		$('#next-button').removeClass('activated');
		next();
	}
});

window.addEventListener('resize', function(event){
  positionLocalVideo();
});

$(document).ready(function() {
	/////////////////////////////////
	// SPLIT VIEW
	/////////////////////////////////	
	var sizes = localStorage.getItem('split-sizes');
	if (sizes) {
		sizes = JSON.parse(sizes);
	} else {
		sizes = [40, 60]; // default sizes
	}
	var split = Split(['#a', '#b'], {
		sizes: sizes,
		minSize: [400, 0],
		gutterSize: 8,
		cursor: 'col-resize',
		onDragEnd: function() {
			localStorage.setItem('split-sizes', JSON.stringify(split.getSizes()));
		},
		onDrag: function() {
			positionLocalVideo();
		}
	});
	Split(['#e', '#f'], {
		direction: 'vertical',
		sizes: [90, 10],
		gutterSize: 8,
		cursor: 'row-resize'
	});
	
	
	/////////////////////////////////
	// AVATARS
	/////////////////////////////////	
	// Bind onclick for every avatar element in the avatar selection bubble
    for (var id=1; id<=6; id++) {
	    var elemId = getElementIdForAvatarId(id);
	    
	    var onclickWrapper = function(id) {
		    return function callback() {
		    	var avatarId = id;
				setAvatar(this.id, avatarId);
    		}
	    }
	    
	    $("#"+elemId).on("click", onclickWrapper(id));   
    }
    
    setAvatar('avatar-'+_avatar, _avatar);
    
	// When the #avatarsMenu gets focus position the appearing bubble next to #avatarsMenu
	$('#avatarsMenu').bind('focus', function(){
	    positionAvatarMenu();
	});
		
	/////////////////////////////////
	// CHAT
	/////////////////////////////////	
	// Respond to return key in message input box (send message)
	$("#data-channel-send").on("keydown", function callback(e) {
		var value = $(this).val();
		if (e.keyCode == 13 && value != '') {
			var message = value;
			var messageObj = message + '_' + _avatar + ':' + _name;
			addChatBubble(messageObj, true);
			
			messageObj = 'chat:'+ messageObj;
			_meeting.sendChatMessage(messageObj);
			$(this).val('');
			_typing = false;
			
			if ($("#partner-typing-message").length) {
				$("#partner-typing-message").remove();
				$("#chat-messages").append("<div id='partner-typing-message' class='' style='clear:both'>Partner is typing a message...</div>");
			}

			return false;
		}
	});
	
	$('#data-channel-send').on('input propertychange', function() {
	 	if (this.value.length) {
			// User is started typing a message...
			if (!_typing) {
				_typing = true;
				_meeting.sendChatMessage('start_typing:');
			}
		} else  {
			_typing = false;
			_meeting.sendChatMessage('stop_typing:');
		}
	});
	
	/////////////////////////////////
	// MEETING
	/////////////////////////////////
	AdapterJS.webRTCReady(function(isUsingPlugin) {
		_meeting = new Meeting(_host);
		_meeting.onLocalVideo(function(stream) {
			// document.querySelector('#local-video').src = window.URL.createObjectURL(stream);
			attachMediaStream(document.querySelector('#local-video'), stream); 
			$("#toggle-mic-label").on("click", function callback(e) {
				toggleMic();
			});
			$("#toggle-cam-label").on("click", function callback(e) {
				toggleVideo();
			});
			positionLocalVideo();
		});
		_meeting.onRemoteVideo(function(stream) {
			addRemoteVideo(stream);
		});
		_meeting.onParticipantHangup(function() {
			// Partner just left the meeting. Remove the remote video
			removeRemoteVideo();
		});
		_meeting.onChatReady(function() {
			_chatReady = true;
			$("#data-channel-send").prop('disabled', false);
		});
		_meeting.onChatNotReady(function() {
			_chatReady = false;
			$("#data-channel-send").prop('disabled', true);
		});
		_meeting.onChatMessage(function(message) {
			var split = message.indexOf(":");
			var type = message.substring(0, split);
			if (type === 'chat') {
				$("#partner-typing-message").remove();
				addChatBubble(message.substring(split+1), false);
			}
			if (type === 'avatar') {
				var id = message.substring(split+1);
				updateChatAvatarIcons('left', id);
			}
			if (type === 'start_typing') {
				$("#chat-messages").append("<div id='partner-typing-message' class='' style='clear:both'>Partner is typing a message...</div>");
			}
			if (type === 'stop_typing') {
				$("#partner-typing-message").remove();
			}		
		});
		_meeting.onJoinedRoom(function() {
			joinedRoom();
		});
		_meeting.onNextFailed(function() {
			console.log('Next failed.');
		});
		_meeting.init($("#checkbox-cam").prop("checked"), $("#checkbox-mic").prop("checked"));
	});
	
}); // end of document.ready
////////////////////////////////////////////////////////////////////////////
// VIDEO & MICROPHONE
////////////////////////////////////////////////////////////////////////////
function positionLocalVideo() {	
	if (_hasRemoteVideo === true){		
		var $remoteVideoWrap = $('#remote-video-wrap');
		var remoteVideoWrapWidth = $remoteVideoWrap.outerWidth(true);
		var remoteVideoWrapHeight = $remoteVideoWrap.outerHeight(true);
		var remoteVideoHeight = remoteVideoWrapWidth * (3/4);
		var remoteVideoTop = (remoteVideoWrapHeight - remoteVideoHeight)/2;
		
		var $localVideoWrap = $('#local-video-wrap');
		$localVideoWrap.removeAttr( 'style' );
		
		var localVideoWrapWidth = $localVideoWrap.outerWidth(true);
		var localVideoWrapHeight = $localVideoWrap.outerHeight(true);
		var localVideoHeight = localVideoWrapWidth * (3/4);
		
		var localVideoTop = remoteVideoTop + remoteVideoHeight - localVideoHeight - 20;
		var $localVideo = $('#local-video');
		$localVideoWrap.css({top: localVideoTop, right: 20, position:'absolute'});
		$localVideo.css({width: localVideoWrapWidth, height: localVideoWrapHeight}); 
	} else {
		var $localVideoWrap = $('#local-video-wrap');
		var $localVideo = $('#local-video');
		$localVideoWrap.removeAttr( 'style' );
		
		$localVideoWrap.css({top: '50%', left: '50%', width:'50%', 	"margin-top":'-19%', "margin-left":'-25%'});
		$localVideo.css({width: '100%', height: 'auto'}); 
	}
}

function joinedRoom() {
	console.log('Joined room.');
	_allowNext = true;
}

function addRemoteVideo(stream) {
	_hasRemoteVideo = true;
	
	console.log("Room.addRemoteVideo " + stream);
	// $("#remote-video").attr({ "src": window.URL.createObjectURL(stream), "autoplay": "autoplay" });
	
	// Remove old video objects
	$("#remote-video").remove();
	
	// Create new one and add to DOM
	var $video = $("<video class='video-box' id='remote-video' autoplay></video>");
	$('#remote-video-wrap').append($video);
	
	var remoteVideoElement = attachMediaStream(document.querySelector('#remote-video'), stream); 
	$("#spinner-loader-center").hide();
	$("#remote-video").show();
	$('#local-video-wrap').removeClass('single');
	
	$("#chat-messages").append("<div class='on-remote-video-message' style='clear:both'>You are now chatting with a random stranger. Say hi!</div>");
	
	positionLocalVideo();
}

function removeRemoteVideo() {
	_hasRemoteVideo = false;
	positionLocalVideo();
	
	$("#spinner-loader-center").show();
	$("#remote-video").hide();
	$('#local-video-wrap').addClass('single');
	next();
}

function next() {
	_hasRemoteVideo = false;
	clearChat();
	if (_allowNext) {
		_allowNext = false;
		_meeting.next();
	}
}

function enterFullScreen() {}
/**
 * Disable enable mic
 *
 */

function toggleMic() {
	_meeting.enableMic(!$("#checkbox-mic").prop("checked"));
}
/**
 * Disable enable local video
 *
 */

function toggleVideo() {
	_meeting.enableVideo(!$("#checkbox-cam").prop("checked"));
}
////////////////////////////////////////////////////////////////////////////
// AVATARS
////////////////////////////////////////////////////////////////////////////
/**
 * When the #avatarsMenu gets focus position the appearing bubble (avatar items) next to #avatarsMenu (menu Icon)
 *
 */
function positionAvatarMenu() {
	var $avatars = $("#avatarsContent");
	var $avatarMenuItem = $("#avatarsMenu");
	var left = $avatarMenuItem.offset().left + $avatarMenuItem.width()/2 - $avatars.width()/2;
	var top = $avatarMenuItem.offset().top + $avatarMenuItem.height() + 20;
	$avatars.css("left", left);
	$avatars.css("top",top);
}

/**
 * Given an id (1, 2, 3, 4, 5, 6) it returns the HTML element.id for the avatar element in the avatar
 * chooser bubble.
 *
 */
function getElementIdForAvatarId(id) {
	if (id>=1 && id<=6) {
		return 'avatar-'+id;
	} else {
		console.log("Avatar ID not valid! "+id)
	}
}

/**
 * Set avatar to id (1..6)
 *
 */
function setAvatar(elemId, id) {
	_avatar = id;
	$(".avatarIcon").removeClass('selected');
	$("#"+elemId).addClass('selected');
	$("#avatarsMenu").blur();	
	$("#avatarsMenu").css('background-image', 'url(../images/avatars/' + id + '.png)');
	
	// Update any own existing avatar icons in chat 
	updateChatAvatarIcons('right', _avatar);
	
	// Inform counterpart about avatar update
	if (_chatReady) {
		// Inform counterpart about the avatar change
		_meeting.sendChatMessage('avatar:'+id);	
	}
}
////////////////////////////////////////////////////////////////////////////
// CHAT
////////////////////////////////////////////////////////////////////////////
/**
 * Display a chat bubble in the chat messages container.
 *
 * message: the message to display
 * self: is true if we are sending the message. It is false if we are the receiver
 *
 */

function addChatBubble(msg, self) {
	var message = msg.substr(0, msg.lastIndexOf('_'));
	var suffix = msg.substr(msg.lastIndexOf('_') + 1, msg.length);
	var params = suffix.split(':');
	var avatarId = params[0];
	var name;
	if (self) {
		name = 'You';
	} else {
		name = params[1];
	}
	var $messageWrapper;
	var $bubble;
	var $bubbleCell;
	var $avatarIcon;
	var $participantName;
	var avatarClass = getAvatarClassForId(avatarId);
	// own messages are always displayed on the right
	if (self == true) {
		$bubbleCell = $("<div class='bubbleCell right'></div>");
		$messageWrapper = $("<div class='messageWrapper right'></div>");
		$bubble = $("<div class='bubble right'></div>");
		$avatarIcon = $("<div class='avatarCell right'><div class='avatar " + avatarClass + "'></div></div>");
		$participantName = $("<div class='chatName'></div>");
		$participantName.text(name);
		$avatarIcon.append($participantName);
		$bubbleCell.append($bubble);
		$messageWrapper.append($bubbleCell);
		$messageWrapper.append($avatarIcon);
	} else {
		$bubbleCell = $("<div class='bubbleCell left'></div>");
		$messageWrapper = $("<div class='messageWrapper left'></div>");
		$bubble = $("<div class='bubble left'></div>");
		$avatarIcon = $("<div class='avatarCell left'><div class='avatar " + avatarClass + "'></div></div>");
		$participantName = $("<div class='chatName'></div>");
		$participantName.text(name);
		$avatarIcon.append($participantName);
		$bubbleCell.append($bubble);
		$messageWrapper.append($avatarIcon);
		$messageWrapper.append($bubbleCell);
	}
	var $content = $("<div class='bubbleContent'></div>");
	// Remove any HTML code from the message
	var proccessedMessage = stripHtml(message);
	// Convert any URLs in the text to links (<a></a>)
	proccessedMessage = urlify(proccessedMessage);
	$content.html(proccessedMessage);
	$($bubble).append($content);
	var $chatMessages = $("#chat-messages");
	$chatMessages.append($messageWrapper);
	// Break the float
	$chatMessages.append("<div style='clear:both'></div>");
	$chatMessages.scrollTop($chatMessages.height())
}

function clearChat() {
	$("#chat-messages").empty();
}

function updateChatAvatarIcons(orientation, id) {
	var avatarCells;
	if (orientation === 'right') {
		avatarCells = $(".avatarCell.right");
	} else {
		avatarCells = $(".avatarCell.left");
	}
	
	if (avatarCells && avatarCells.length>0) {
		for (var i = 0; i < avatarCells.length; i++) {
			var $avatar = $(avatarCells[i]).children(":first");
			$avatar.removeClass();
			$avatar.addClass('avatar');
			$avatar.addClass(getAvatarClassForId(id));
		}	
	}
}

/**
 * Given an id (1, 2, 3, 4, 5, 6) it returns the corresponding css class for the avatar in the messages field
 *
 */

function getAvatarClassForId(id) {
	if (id >= 1 && id <= 6) {
		return 'chatIcon-' + id;
	} else {
		console.log('Avatar ID ' + id + ' not valid! Returning default: 1');
		return 'chatIcon-1';
	}
}
/**
 * Remove any HTML code from the text
 *
 */

function stripHtml(html) {
	var tmp = document.createElement("div");
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || "";
}
/**
 * Convert any URLs in the text to links (<a></a>)
 *
 */

function urlify(text) {
	var urlRegex = /(https?:\/\/[^\s]+)/g;
	return text.replace(urlRegex, function(url) {
		return "<a target='_blank' href='" + url + "'>" + url + "</a>";
	})
}
'use strict';

var meeting;
var name = 'Stranger';
var avatar = 2;
var host = HOST_ADDRESS; // HOST_ADDRESS gets injected into room.ejs from the server side when it is rendered
var _allowNext = true;

$(document).on('keydown',function(evt) {
    if (evt.keyCode == 27) {
	   $('#next-button').addClass('activated');
    }
});

$(document).on('keyup',function(evt) {
    if (evt.keyCode == 27) {
	   $('#next-button').removeClass('activated');
       next();
    }
});

$( document ).ready(function() {
	/////////////////////////////////
	// SPLIT VIEW
	/////////////////////////////////	
	var sizes = localStorage.getItem('split-sizes');
	if (sizes) {
		sizes = JSON.parse(sizes);
	} else {
		sizes = [80, 20];  // default sizes
	}

	var split = Split(['#a', '#b'], {
		sizes: sizes,
		minSize: [400,0],
		gutterSize: 8,
		cursor: 'col-resize',
		onDragEnd: function () {
			localStorage.setItem('split-sizes', JSON.stringify(split.getSizes()));
		}
	});
	
    Split(['#e', '#f'], {
      direction: 'vertical',
      sizes: [90, 10],
      gutterSize: 8,
      cursor: 'row-resize'
    });
    
	
	/////////////////////////////////
	// CHAT
	/////////////////////////////////	
	// Respond to return key in message input box (send message)
    $("#data-channel-send").on("keydown",function callback(e) {
	    var value = $(this).val();
        if(e.keyCode == 13 && value!='') {
            var message = value;
            var messageObj = message+'_'+avatar+':'+name;
            meeting.sendChatMessage(messageObj); 
            addChatBubble(messageObj, true);
            $(this).val('');
            return false;
        }
	});

	/////////////////////////////////
	// CREATE MEETING
	/////////////////////////////////
	meeting = new Meeting(host);
	
	meeting.onLocalVideo(function(stream) {
	        document.querySelector('#local-video').src = window.URL.createObjectURL(stream);
    		
	        $("#toggle-mic-label").on("click",function callback(e) {
		        toggleMic();
    		});
    		
    		$("#toggle-cam-label").on("click",function callback(e) {
				toggleVideo();
    		});
    		
	    }
	);
	
	meeting.onRemoteVideo(function(stream) {
	        addRemoteVideo(stream);  
	    }
	);
	
	meeting.onParticipantHangup(function() {
			// Partner just left the meeting. Remove the remote video
			removeRemoteVideo();
		}
	);
    
    meeting.onChatReady(function() {
			$("#data-channel-send").prop('disabled', false);
	    }
	);
	
	meeting.onChatNotReady(function() {
			$("#data-channel-send").prop('disabled', true);
	    }
	);
	
	meeting.onChatMessage(function(message) {
	        addChatBubble(message, false);
	    }
	);
	
	meeting.onJoinedRoom(function() {
	        joinedRoom();
	    }
	);
	
	meeting.onNextFailed(function() {
			console.log('Next failed.');
	    }
	);
	
	meeting.init($("#checkbox-cam").prop("checked"), $("#checkbox-mic").prop("checked"));
}); // end of document.ready

////////////////////////////////////////////////////////////////////////////
// VIDEO
////////////////////////////////////////////////////////////////////////////
function joinedRoom() {
	console.log('Joined room.');
	_allowNext = true;
}

function addRemoteVideo(stream) {
	console.log("Room.addRemoteVideo "+stream);
    $( "#remote-video" ).attr({"src": window.URL.createObjectURL(stream), "autoplay": "autoplay"});
	$("#spinner-loader-center").hide();
	$("#remote-video").show();
	$('#local-video-wrap').removeClass('single');
}

function removeRemoteVideo() {
	$("#spinner-loader-center").show();
	$("#remote-video").hide();
	$('#local-video-wrap').addClass('single');
	next();
}

function next() {
	clearChat();
	if (_allowNext) {
		_allowNext = false;
		meeting.next();	
	}
}


function enterFullScreen() {
	
}

/**
 * Disable enable mic
 *
 */
function toggleMic() {
	meeting.enableMic(!$("#checkbox-mic").prop("checked"));
}

/**
 * Disable enable local video
 *
 */
function toggleVideo() {
	meeting.enableVideo(!$("#checkbox-cam").prop("checked"));
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
	var suffix = msg.substr(msg.lastIndexOf('_')+1, msg.length);
	var params = suffix.split(':');
	var avatarId = params[0];
	var name;
	if (self) {
		name = 'You';
	}else {
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
        $avatarIcon = $("<div class='avatarCell right'><div class='avatar "+avatarClass+"'></div></div>");
       
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
        $avatarIcon = $("<div class='avatarCell left'><div class='avatar "+avatarClass+"'></div></div>");
        
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

/**
 * Given an id (1, 2, 3, 4, 5, 6) it returns the corresponding css class for the avatar in the messages field
 *
 */
function getAvatarClassForId(id) {
	if (id>=1 && id<=6) {
		return 'chatIcon-'+id;
	} else {
		console.log('Avatar ID '+ id +' not valid! Returning default: 1');
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
'use strict';

var meeting;
var host = HOST_ADDRESS; // HOST_ADDRESS gets injected into room.ejs from the server side when it is rendered

$( document ).ready(function() {
	/////////////////////////////////
	// CREATE MEETING
	/////////////////////////////////
	meeting = new Meeting(host);
	
	meeting.onLocalVideo(function(stream) {
	        //alert(stream.getVideoTracks().length);
	        document.querySelector('#localVideo').src = window.URL.createObjectURL(stream);
	        
	        $("#micMenu").on("click",function callback(e) {
				toggleMic();
    		});
    		
    		$("#videoMenu").on("click",function callback(e) {
				toggleVideo();
    		});

			$("#localVideo").prop('muted', true);

	    }
	);
	
	meeting.onRemoteVideo(function(stream, participantID) {
	        addRemoteVideo(stream, participantID);  
	    }
	);
	
	meeting.onParticipantHangup(function(participantID) {
			// Someone just left the meeting. Remove the participants video
			removeRemoteVideo(participantID);
		}
	);
    
    meeting.onChatReady(function() {
			console.log("Chat is ready");
	    }
	);
	
	meeting.onChatNotReady(function() {
			console.log("Chat is not ready yet");
	    }
	);
	
    //var room = window.location.pathname.match(/([^\/]*)\/*$/)[1];
    meeting.joinRoom();
}); // end of document.ready

function addRemoteVideo(stream, participantID) {
	console.log("Room.addRemoteVideo "+stream+" for participantID "+ participantID);
    
    // Remove old videobox
    $( "#remote-video" ).remove();
    
    var $videoBox = $("<div class='videoWrap' id='remote-video'></div>");
    var $video = $("<video class='videoBox' autoplay></video>");
    $video.attr({"src": window.URL.createObjectURL(stream), "autoplay": "autoplay"});
    $videoBox.append($video);
	$("#videosWrapper").append($videoBox);
	adjustVideoSize();	
}

function removeRemoteVideo(participantID) {
	$( "#remote-video" ).remove();
	adjustVideoSize();
}

function next() {
	meeting.next();
}

function adjustVideoSize() {
	var numOfVideos = $(".videoWrap").length; 
	if (numOfVideos == 2) {
		$(".videoWrap").width('auto');
		$("#localVideoWrap").css("width", 20+"%");
	} else {
		$("#localVideoWrap").width('auto');
	}
}
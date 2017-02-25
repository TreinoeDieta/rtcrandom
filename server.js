/**
 * Server module.
 *
 *
 */
 
'use strict';
 
var nodestatic = require('node-static');
var express = require('express');
var path = require('path');
var http = require("http");
var cors = require('cors');
var serverPort = process.env.OPENSHIFT_NODEJS_PORT || 8080 // $OPENSHIFT_NODEJS_PORT is given by OpenShift
var serverIpAddress = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1' // $OPENSHIFT_NODEJS_IP is given by OpenShift
var socketIoServer = process.env.OPENSHIFT_DOMAIN || '127.0.0.1:8080';

////////////////////////////////////////////////
// SETUP SERVER
////////////////////////////////////////////////
    
var app = express();
require('./router')(app, socketIoServer);

// Static content (css, js, .png, etc) is placed in /public
app.use(express.static(__dirname + '/public'));

app.use(cors());
	
// Location of our views
app.set('views',__dirname + '/views');

// Use ejs as our rendering engine
app.set('view engine', 'ejs');

// Tell Server that we are actually rendering HTML files through EJS.
app.engine('html', require('ejs').renderFile);

var server=app.listen(serverPort, serverIpAddress, function(){
    console.log("Express is running on port "+serverPort);
});
var io = require('socket.io').listen(server, {log: false, origins:'*:*' });
	
////////////////////////////////////////////////
// USER HANDLING
////////////////////////////////////////////////
var _queue = [];
var _isReady = {};
var _clients = {};


////////////////////////////////////////////////
// HELP FUNCTIONS
////////////////////////////////////////////////
function printQueue() {
    console.log('Queue:');
    for (var i = 0; i < 5; i++) {
    	console.log(i+': '+_queue[i]);
	}
	console.log('');
}

/**
 * Generates a random string of length 6. Example: qyvf2x 
 *
 *
 */
function getRoom() {
    return ("000000" + (Math.random()*Math.pow(36,6) << 0).toString(36)).slice(-6);
}


////////////////////////////////////////////////
// EVENT HANDLERS
////////////////////////////////////////////////

io.sockets.on('connection', function (socket) {
	function log(){
        var array = [">>> Message from server: "];
        for (var i = 0; i < arguments.length; i++) {
	  	    array.push(arguments[i]);
        }
	    socket.emit('log', array);
	}

    socket.on('disconnect',function(){
        console.log('User disconnected from room '+ socket.room);
    });
    
	socket.on('message', function (message) {
		console.log('Got message: ' , message, ' in room '+socket.room);
        socket.broadcast.to(socket.room).emit('message', message);
		
        if (message.type=="newparticipant") {
        }
        
		if (message.type=="bye") {
			printQueue();
			
			console.log('Deleting user '+message.from+' from queue.');
			delete _clients[message.from];
			delete _isReady[message.from];
			var index = _queue.indexOf(message.from);
			
			console.log(message.from+' found at index '+index);
			
			if (index>=0) {
				_queue.splice(index, 1);	
			}
			
			printQueue();
		}
	});
    
	socket.on('ready', function (message) {
		console.log('READY: ------------------------------------------------');
		
		console.log('Peer '+ message.from +' is ready.');
		_isReady[message.from] = true;
		
		console.log('-------------------------------------------------------');
	});
	
	socket.on('next', function (message) {
		console.log('NEXT: ------------------------------------------------');
		console.log('Next room requested from '+ message.from);

		// Store socket temporary for when we have enough requests
		_clients[message.from] = socket;

		// Leave current room
		if (message.currentRoom) {
			socket.leave(message.currentRoom);
			console.log(message.from+' leaves current room '+message.currentRoom);	
		}
		
		if (_queue.indexOf(message.from) < 0) {
			console.log('Adding '+message.from+' to queue.');
			_queue.push(message.from);
		}

        if (_queue.length >= 2) {
	        var a = _queue.shift();
	        var b = _queue.shift();
	        
	        var room = getRoom();
	        
	        console.log('Sending room '+room+' out.');
	        
	        _clients[a].emit('next', {dest: a, participant:b, room:room, success: true});
	        _clients[b].emit('next', {dest: b, participant:a, room:room, success: true});
	        
			delete _clients[a];
			delete _clients[b];
        } else {
	        console.log('Not enough requests in the queue.');
	        _clients[message.from].emit('next', {dest: message.from, success: false});
        }
        
        console.log('-------------------------------------------------------');
	});

	socket.on('join', function (message) {
		console.log('JOIN: -------------------------------------------------');
		
        var room = message.room;
        socket.room = room;
        
		var participantID = message.from;
		configNameSpaceChannel(room);
				
        console.log(participantID + " requested to join room "+ room);
        if (io.sockets.clients(room).length == 0){
            console.log(participantID + "joined first. Creates room "+ room);
            socket.join(room);
			socket.emit('created', room);
		} else {
            console.log(participantID + " joins room "+ room);		
            socket.join(room);
            
            console.log(room+' has '+io.sockets.clients(room).length+' participants');
            
			socket.emit('joined', room);
		}
		
		console.log('-------------------------------------------------------');
	});
    
    // Setup a communication channel (namespace) to communicate with a given participant (participantID)
    function configNameSpaceChannel(room) {
        var socketNamespace = io.of('/'+room);
        
        socketNamespace.on('connection', function (socket){
	        console.log('connect %s', socket);
            socket.on('message', function (message) {
                // Send message to everyone BUT sender
                console.log('Sending message %j', message);
                socket.broadcast.emit('message', message);
            });
		
        });
		
		return socketNamespace;
    }

});


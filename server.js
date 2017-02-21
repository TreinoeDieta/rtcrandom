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
var serverPort = process.env.OPENSHIFT_NODEJS_PORT || 1337 // $OPENSHIFT_NODEJS_PORT is given by OpenShift
var serverIpAddress = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1' // $OPENSHIFT_NODEJS_IP is given by OpenShift
var socketIoServer = process.env.OPENSHIFT_DOMAIN || '127.0.0.1';

////////////////////////////////////////////////
// SETUP SERVER
////////////////////////////////////////////////
    
var app = express();
require('./router')(app, socketIoServer);

// Static content (css, js, .png, etc) is placed in /public
app.use(express.static(__dirname + '/public'));

// Location of our views
app.set('views',__dirname + '/views');

// Use ejs as our rendering engine
app.set('view engine', 'ejs');

// Tell Server that we are actually rendering HTML files through EJS.
app.engine('html', require('ejs').renderFile);

var server=app.listen(serverPort, serverIpAddress, function(){
    console.log("Express is running on port "+serverPort);
});
var io = require('socket.io').listen(server, { log: false });

////////////////////////////////////////////////
// USER HANDLING
////////////////////////////////////////////////
var users = {}; // Map of all users currently online to their sockets
var occupied = {}; // List of users currently in a chat.
var history = {}; // Contains (A,B) pairs of previously matched users.

////////////////////////////////////////////////
// HELP FUNCTIONS
////////////////////////////////////////////////
function printUsers() {
    console.log('Users:');
    for (var user in users) {
        if (users.hasOwnProperty(user)) {
            console.log(user);   
        }
    }    
}

function printOccupiedUsers() {
    console.log('Occupied:');
    for (var user in occupied) {
        if (occupied.hasOwnProperty(user)) {
            console.log(user);   
        }
    }    
}

////////////////////////////////////////////////
// EVENT HANDLERS
////////////////////////////////////////////////

io.sockets.on('connection', function (socket){
    
	function log(){
        var array = [">>> Message from server: "];
        for (var i = 0; i < arguments.length; i++) {
	  	    array.push(arguments[i]);
        }
	    socket.emit('log', array);
	}

    socket.on('disconnect',function(){
        console.log('User disconnected from room '+ socket.room);
        
        delete users[socket.room];
        delete occupied[socket.room];
        
        //socket.broadcast.to(socket.room).emit('message', { type: 'bye', from: socket.room });
    });
    
	socket.on('message', function (message) {
		console.log('Got message: ' , message, ' in room '+socket.room);
        socket.broadcast.to(socket.room).emit('message', message);
		
        if (message.type=="newparticipant") {
            
        }
        
		if (message.type=="bye") {
            io.sockets.clients(message.from).forEach(function(s){
                s.leave(message.from);
            });
            
			// Remove user
			delete users[message.from];
            
            var room = occupied[message.from];
            // Free user
			delete occupied[message.from];
            
            // Free room
            delete occupied[room];
		}
	});
    
	socket.on('next', function (message) {
		console.log('Next room requested from '+ message.from);
		
		// No longer occupied
        var room = occupied[message.from];
		delete occupied[message.from];
		delete occupied[room];
        
        printUsers();
        printOccupiedUsers();
        
		var next;
		for (var user in users) {
			if (message.from !== user && users.hasOwnProperty(user) && !occupied.hasOwnProperty(user) && io.sockets.clients(user).length == 1) {
				// Found a free room/user!
				next = user;
				break;
			}
            
            // Clear also empty rooms
            if (io.sockets.clients(user).length == 0) {
                delete users[user];
                delete occupied[user];
            }
		}
		
		if (next) {
            console.log('Found free room '+next);
			socket.emit('next', {dest: message.from, room:next});
		} else {
			console.log('No free room found.');
		}
	});

	socket.on('create or join', function (message) {
        var room = message.room;
        socket.room = room;
        
		var participantID = message.from;
		configNameSpaceChannel(participantID);
				
		users[participantID] = '';
		
        
        console.log(participantID + " requested to create/join room "+ room);
		if (io.sockets.clients(room).length == 0){
            console.log(participantID + " creates room "+ room);
            socket.join(room);
			socket.emit('created', room);
		} else {
            console.log(participantID + " joins room "+ room);
			io.sockets.in(room).emit('join', room);
            socket.join(room);
            console.log(room+'has '+io.sockets.clients(room).length+' participants');
			socket.emit('joined', room);
			
            if (participantID !== room) {
                 occupied[participantID] = room;
			     occupied[room] = participantID;   
            }
		}
		
		log(participantID + ' requested to create or join room', room);
	});
    
    // Setup a communication channel (namespace) to communicate with a given participant (participantID)
    function configNameSpaceChannel(participantID) {
        var socketNamespace = io.of('/'+participantID);
        
        socketNamespace.on('connection', function (socket){
            socket.on('message', function (message) {
                // Send message to everyone BUT sender
                console.log('Sending message '+message.type);
                socket.broadcast.emit('message', message);
            });
		
        });
		
		return socketNamespace;
    }

});


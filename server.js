/**
 * Server module.
 *
 *
 */
 
'use strict';
 
var nodestatic = require('node-static');
var express = require('express');
var path = require('path');
var crypto = require('crypto');
var fs = require("fs");
var http = require("http");
var https = require('https');
var serverPort = process.env.OPENSHIFT_NODEJS_PORT || 1337
var serverIpAddress = process.env.OPENSHIFT_NODEJS_IP || '192.168.0.104'
var socketIoServer = '192.168.0.104';

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

// openssl req -newkey rsa:2048 -new -nodes -keyout key.pem -out csr.pem
// openssl x509 -req -days 365 -in csr.pem -signkey key.pem -out server.crt
var options = {
      key: fs.readFileSync('key.pem', 'utf8'),
      cert: fs.readFileSync('server.crt', 'utf8')
   };

var server = https.createServer(options, app).listen(serverPort);


var io = require('socket.io').listen(server);

////////////////////////////////////////////////
// USER HANDLING
////////////////////////////////////////////////
var users = []; // List of all users currently online.
var occupied = []; // List of users currently in a chat.
var history = {}; // Contains (A,B) pairs of previously matched users.

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

	socket.on('message', function (message) {
		log('Got message: ', message);
        socket.broadcast.to(socket.room).emit('message', message);
	});
    
	socket.on('create or join', function (message) {
        var room = message.room;
        socket.room = room;
        var participantID = message.from;
        configNameSpaceChannel(participantID);
        
		var numClients = io.sockets.clients(room).length;

		log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to create or join room', room);

		if (numClients == 0){
			socket.join(room);
			socket.emit('created', room);
		} else {
			io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room);
		}
	});
    
    // Setup a communication channel (namespace) to communicate with a given participant (participantID)
    function configNameSpaceChannel(participantID) {
        var socketNamespace = io.of('/'+participantID);
        
        socketNamespace.on('connection', function (socket){
            socket.on('message', function (message) {
                // Send message to everyone BUT sender
                socket.broadcast.emit('message', message);
            });
        });
    }

});

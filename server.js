/**
 * Server module.
 *
 *
 */
 
'use strict';

var environment = process.env.RTCRANDOM_ENV || 'local';
var nodestatic = require('node-static');
var express = require('express');
var path = require('path');
var http = require("http");
var cors = require('cors');
var Logger = require('./logger');
var logger = new Logger(environment);
var serverPort = process.env.OPENSHIFT_NODEJS_PORT || 8080 // $OPENSHIFT_NODEJS_PORT is given by OpenShift
var serverIpAddress = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1' // $OPENSHIFT_NODEJS_IP is given by OpenShift
var socketIoServer = process.env.OPENSHIFT_DOMAIN || '127.0.0.1:8080';

////////////////////////////////////////////////
// SETUP SERVER
////////////////////////////////////////////////   
function requireHTTPS(req, res, next) {
    if (!req.secure) {
        if (environment === 'test' || environment === 'production') {
	        var redirect = 'https://' + req.get('host') + req.url;
	        logger.info("Non secure URL accessed. redirecting to "+redirect);
	        //return res.redirect(redirect);
        }
    }
    next();
}



var app = express();

app.use(requireHTTPS);

require('./router')(app, socketIoServer, environment);

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
    logger.info("Express is running on port "+serverPort);
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
    logger.info('Queue:');
    for (var i = 0; i < 5; i++) {
    	logger.info(i+': '+_queue[i]);
	}
	logger.info('');
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
        logger.info('User disconnected from room '+ socket.room);
    });
    
	socket.on('message', function (message) {
		logger.info('Got message: ' , message, ' in room '+socket.room);
        socket.broadcast.to(socket.room).emit('message', message);
		
        if (message.type=="newparticipant") {
        }
        
		if (message.type=="bye") {
			printQueue();
			
			logger.info('Deleting user '+message.from+' from queue.');
			delete _clients[message.from];
			delete _isReady[message.from];
			var index = _queue.indexOf(message.from);
			
			logger.info(message.from+' found at index '+index);
			
			if (index>=0) {
				_queue.splice(index, 1);	
			}
			
			printQueue();
		}
	});
    
	socket.on('ready', function (message) {
		logger.info('READY: ------------------------------------------------');
		
		logger.info('Peer '+ message.from +' is ready.');
		_isReady[message.from] = true;
		
		logger.info('-------------------------------------------------------');
	});
	
	socket.on('next', function (message) {
		logger.info('NEXT: ------------------------------------------------');
		logger.info('Next room requested from '+ message.from);

		// Store socket temporary for when we have enough requests
		_clients[message.from] = socket;

		// Leave current room
		if (message.currentRoom) {
			socket.leave(message.currentRoom);
			logger.info(message.from+' leaves current room '+message.currentRoom);	
		}
		
		if (_queue.indexOf(message.from) < 0) {
			logger.info('Adding '+message.from+' to queue.');
			_queue.push(message.from);
		}

        if (_queue.length >= 2) {
	        var a = _queue.shift();
	       
			// Remove any ghost peers that left without saying good bye
	        while (_clients[a] && _clients[a].disconnected) {
		        delete _clients[a];
		        a = _queue.shift();
	        }
	        
	        var b = _queue.shift();
	        while (_clients[b] && _clients[b].disconnected) {
		        delete _clients[b];
		        b = _queue.shift();
	        }
	        
	        if (a && b) {
		        // We still have at least 2 peers left in the queue
		    	var room = getRoom();
	        
		        logger.info('Sending room '+room+' out to '+a+' and '+b);
		        
		        _clients[a].emit('next', {dest: a, participant:b, room:room, success: true});
		        _clients[b].emit('next', {dest: b, participant:a, room:room, success: true});
		        
				delete _clients[a];
				delete _clients[b];   
			
				return; 
	        }
	        
	        // Only one connected peer exist in the queue. Put it back.
	        if (a) {
		        // put a back in the queue
		        _queue.push(a);
	        } else if (b) {
		        _queue.push(b);
	        }
        }
	    
	    logger.info('Not enough requests in the queue.');
	    _clients[message.from].emit('next', {dest: message.from, success: false});
        
        logger.info('-------------------------------------------------------');
	});

	socket.on('join', function (message) {
		logger.info('JOIN: -------------------------------------------------');
		
        var room = message.room;
        socket.room = room;
        
		var participantID = message.from;
		configNameSpaceChannel(room);
				
        logger.info(participantID + " requested to join room "+ room);
        if (io.sockets.clients(room).length == 0){
            logger.info(participantID + "joined first. Creates room "+ room);
            socket.join(room);
			socket.emit('created', room);
		} else {
            logger.info(participantID + " joins room "+ room);		
            socket.join(room);
            
            logger.info(room+' has '+io.sockets.clients(room).length+' participants');
            
			socket.emit('joined', room);
		}
		
		logger.info('-------------------------------------------------------');
	});
    
    // Setup a communication channel (namespace) to communicate with a given participant (participantID)
    function configNameSpaceChannel(room) {
        var socketNamespace = io.of('/'+room);
        
        socketNamespace.on('connection', function (socket){
	        logger.info('connect %s', socket);
            socket.on('message', function (message) {
                // Send message to everyone BUT sender
                logger.info('Sending message %j', message);
                socket.broadcast.emit('message', message);
            });
		
        });
		
		return socketNamespace;
    }

});


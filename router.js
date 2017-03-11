/**
 * This module serves as the router to the different views. It handles
 * any incoming requests.
 *
 * @param app An express object that handles our requests/responses
 * @param socketIoServer The host address of this server to be injected in the views for the socketio communication
 */
'use strict';
module.exports = function(app, socketIoServer, environment) {
	app.get('/', function(req, res) {
		res.render('room', {
			'hostAddress': socketIoServer,
			'environment': environment
		});
	});
	
	app.get('/.well-known/acme-challenge/:challengeHash', function(req, res) {
		var hash = req.params.challengeHash+'.im3xdwOnE4siuDOLKh9D_aLGIuKulPmTzzJgkvhCO5E';
		res.send(hash);
	});
}
var request = require('request');
var when = require('when');
var nodemailer = require('nodemailer');
var http = require('http');
var regos = [];
var authDrivers = [];
var counter = 0;

var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'rmsclientmailer@gmail.com',
        pass: 'horsecowpassword'
    }
});

module.exports = function(app) {
	app.get('/', function (req,res) {
		var newRegos = [];
		var promises = [];

		regos.forEach(function (rego) {
			var deferred = when.defer();
			request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + rego.registration.registrationNumber, function (err, httpResponse, body) {
				var json = JSON.parse(body);
				newRegos.push(json);
				deferred.resolve();
			});

			promises.push(deferred.promise);
		});

		when.all(promises).then(function () {
			regos = newRegos;
			console.log(regos);
			res.render('index.html', {
				regos: regos
			});
		});
	});

	app.get('/filter/:status', function (req, res) {
		var regosToShow = [];
		regos.forEach(function (rego) {
			if (rego.status === req.param('status')) {
				regosToShow.push(rego);
			}
		});
		res.render('index.html', {
			regos: regosToShow
		});
	});

	app.get('/renewals', function (req, res) {
		request.post('http://localhost:8080/RMSRestfulService/renewal/notice/generate?auth=officer', function (err, httpResponse, body) {
			regos = [];
			var json = JSON.parse(body);

			var promises = [];
			json.forEach(function (url) {
				var regoId = url.match(/rego=(.*)/)[1];
				var deferred = when.defer();
				request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + regoId, function (err, httpResponse, resBody) {
					var regoJson = JSON.parse(resBody);
					regos.push(regoJson);

					var rand = 437267364 + counter;
					rand += '';
					counter += 1231;
					var auth = { 
						value: rand, 
						key: regoId
					};
					authDrivers.push(auth);
					console.log(auth);

					var mailOptions = {
					    from: 'RMS Client <rmsclientmailer@gmail.com>',
					    to: 'sakare@gmail.com',
					    subject: 'Your Renewal',
					    text: 'Dear ' + regoJson.registration.driver.lastName + ',\n\nVisit the url here: http://localhost:3000/driver/' + regoJson.registration.registrationNumber + '/' + auth.value + '\n\nCheers,\nRMS'
					};

					// Mail the user
					transporter.sendMail(mailOptions, function(error, info){
					    if (error) {
					        console.log(error);
					    } else {
					        console.log('Message sent: ' + info.response);
					    }
					});

					deferred.resolve();
				});
				promises.push(deferred.promise);
			});

			when.all(promises).then(function () {
				res.render('index.html', {
					regos: regos
				});
			});
		});
	});

	app.get('/renewal/:id', function (req, res) {
		request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + req.param('id'), function (err, httpResponse, body) {
			var json = JSON.parse(body);
			res.render('renewal.html', {
				renewal: json
			});
		});
	});

	app.post('/', function(req, res) {
		var status;
		var promises = [];

		// Update status of renewal, optionally change fee.
		if (req.body.status === 'accept') {
			// Change fee
			status = 'ACCEPTED';
			request.post('http://localhost:8080/RMSRestfulService/payment/new?rego=' + req.body.rego + '&fee=' + req.body.fee + '&auth=officer', function (err, httpResponse, body) {
				console.log(body);
			});
		} else if (req.body.status === 'reject') {
			status = 'REJECTED';
		}

		request.put('http://localhost:8080/RMSRestfulService/renewal/notice/update?rego=' + req.body.rego + '&status=' + status, function (err, httpResponse, body) {
			var deferred = when.defer();
			request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + req.body.rego, function (err, httpResponse, resBody) {
				var regoJson = JSON.parse(resBody);
				var index = -1;

				regos.forEach(function (rego) {
					if (rego.registration.registrationNumber === req.body.rego) {
						index = regos.indexOf(rego);
					}
				});

				if (index > -1) {
					regos.splice(index, 1);
				}

				regos.push(regoJson);
				deferred.resolve();
			});

			promises.push(deferred.promise);
		});

		when.all(promises).then(function () {
			console.log('All get requests complete');
			console.log(regos);
			res.render('index.html', {
				regos: regos
			});
		});
	});

	app.get('/driver/:rego/:auth', function (req, res) {
		var verified = false;
		authDrivers.forEach(function (authDriver) {
			if (authDriver.value === req.param('auth') && authDriver.key === req.param('rego')) {
				verified = true;
				request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + req.param('rego'), function (err, httpResponse, body) {
					var json = JSON.parse(body);
					res.render('driver_renewal.html', {
						renewal: json
					});
				});
			}
		});

		if (!verified) {
			res.render('error.html', {
				status: 401,
				message: 'You are not permitted to view this page'
			});
		}
	});

	app.post('/process/:rego', function (req, res) {
		request.put('http://localhost:8080/RMSRestfulService/renewal/notice/update?rego=' + req.param('rego') + '&status=REQUESTED', function (err, httpResponse, body) {
			var json = JSON.parse(body);
			res.render('driver_renewal.html', {
				renewal: json
			});
		});
	});

	app.post('/cancel/:rego', function (req, res) {
		request.put('http://localhost:8080/RMSRestfulService/renewal/notice/update?rego=' + req.param('rego') + '&status=CANCELLED', function (err, httpResponse, body) {
			var json = JSON.parse(body);
			res.render('driver_renewal.html', {
				renewal: json
			});
		});
	});

	app.post('/delete/:rego', function (req, res) {
		request.del('http://localhost:8080/RMSRestfulService/renewal/notice/archive?rego=' + req.param('rego') + '&auth=driver', function (err, httpResponse, body) {
			var responseMessage = 'Renewal archived!';
			if (httpResponse.statusCode == 304) {
				responseMessage = 'Renewal cannot be archived in the current process.';
			}
			res.render('renewal_archived.html', {
				message : responseMessage
			});
		});
	});

	app.post('/pay', function (req, res) {
		request.put('http://localhost:8080/RMSRestfulService/payment/pay?rego=' + req.body.rego 
																				+ '&name=' + req.body.ccName 
																				+ '&expiry=' + req.body.ccExpiryMonth + '-' + req.body.ccExpiryYear 
																				+ '&number=' + req.body.ccNumber
																				+ '&auth=driver', 
		function (err, httpResponse, body) {
			var json = JSON.parse(body);
			res.render('renewal_payment.html', {
				payment: json
			});
		})
	});

	app.post('/autocheck', function (req, res) {
		var body = 				
			'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:aut="http://autocheck.soacourse.unsw.edu.au">' +
			'  <soapenv:Header/>' +
			'  <soapenv:Body>' +
			'    <aut:AutoCheckRequest>' +
			'      <aut:LastName>' + req.body.lname + '</aut:LastName>' +
			'      <aut:FirstName>' + req.body.fname + '</aut:FirstName>' +
			'      <aut:RegoNumber>' + req.body.rnum + '</aut:RegoNumber>' +
			'    </aut:AutoCheckRequest>' +
			'  </soapenv:Body>' +
			'</soapenv:Envelope>';

		var buffer = "";

		var httpReq = http.request({
	    host: "localhost",
	    path: "/ode/processes/AutoCheck",
	    port: 6060,
	    method: "POST",
	    headers: {
	    		'SOAPAction': 'http://autocheck.soacourse.unsw.edu.au/AutoCheck',
	        'Content-Type': 'text/xml;charset=UTF-8',
	        'Content-Length': Buffer.byteLength(body)
	    }
		}, function(response) {
		  var buffer = "";
		  response.on("data", function( data ) { buffer = buffer + data; } );
		  response.on("end", function( data ) { 
		  	res.send({"body" :buffer});
		  });
		});

		httpReq.on('error', function(e) {
 		  console.log('problem with request: ' + e.stack);
		});

		httpReq.write(body);
		httpReq.end();
	});

	app.post('/autocheck/:rego', function (req, res) {
		request.put('http://localhost:8080/RMSRestfulService/renewal/notice/update?rego=' + req.param('rego') + '&status=UNDER_REVIEW', function (err, httpResponse, body) {
			if (body) {
				var json = JSON.parse(body);
				res.send(json.status);
			}
		});
	});

	app.get('/check/payment/:rego', function (req, res) {
		request.get('http://localhost:8080/RMSRestfulService/payment/check?rego=' + req.param('rego'), function (err, httpResponse, body) {
			var json = JSON.parse(body);
			res.send(json.amount);
		});
	});

	app.post('/sendmail', function (req, res) {
		console.log(req.body);
		var mailOptions = {
		    from: 'RMS Client <rmsclientmailer@gmail.com>',
		    to: 'sakare@gmail.com',
		    subject: 'Your Renewal - Review Status',
		    text: req.body.mail
		};

		// Mail the user
		transporter.sendMail(mailOptions, function(error, info){
		    if (error) {
		        console.log(error);
		    } else {
		        console.log('Message sent: ' + info.response);
		    }
		});
	});
}
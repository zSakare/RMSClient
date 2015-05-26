var request = require('request');
var when = require('when');
var regos = [];

module.exports = function(app) {
	app.get('/', function(req,res) {
		res.render('index.html', {
			regos: regos
		});
	});

	app.get('/renewals', function (req, res) {
		request.post('http://localhost:8080/RMSRestfulService/renewal/notice/generate', function (err, httpResponse, body) {
			regos = [];
			var json = JSON.parse(body);

			var promises = [];
			json.forEach(function (url) {
				var regoId = url.match(/rego=(.*)/)[1];
				//regoIds.push([regoId, ]);
				var deferred = when.defer();
				request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + regoId, function (err, httpResponse, resBody) {
					var regoJson = JSON.parse(resBody);
					var rego = {rego: regoJson.registration.registrationNumber, status: regoJson.status.toUpperCase()};
					regos.push(rego);
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
			request.post('http://localhost:8080/RMSRestfulService/payment/new?rego=' + req.body.rego + '&fee=' + req.body.fee, function (err, httpResponse, body) {
				console.log(body);
			});
		} else if (req.body.status === 'reject') {
			status = 'REJECTED';
		}

		request.put('http://localhost:8080/RMSRestfulService/renewal/notice/update?rego=' + req.body.rego + '&status=' + status, function (err, httpResponse, body) {
			console.log(body);
			var deferred = when.defer();
			request.get('http://localhost:8080/RMSRestfulService/renewal/notice?rego=' + req.body.rego, function (err, httpResponse, resBody) {
				var regoJson = JSON.parse(resBody);
				var regoToUpdate = {rego: regoJson.registration.registrationNumber, status: regoJson.status.toUpperCase()};
				var index = -1;

				regos.forEach(function (rego) {
					if (rego.rego === req.body.rego) {
						index = regos.indexOf(rego);
					}
				});

				if (index > -1) {
					regos.splice(index, 1);
				}

				regos.push(regoToUpdate);
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
}
var http = require('http');
var querystring = require('querystring');
var argv = require('yargs').argv;
var Promise = require('promise');
var fs = require('fs');
var cheerio = require('cheerio')
var juice = require('juice');

var inputFileName = argv.in;
var outputFileName = argv.out;

var getFileContentsPromise = function (filePath) {
	return new Promise(function (resolve, reject) {
		fs.readFile(filePath, 'utf8', function (err, data) {
			if (err) {
				console.log('Could not open file: ' + inputFileName);
				console.log('Reason: ', err);
			} else {
				resolve(data);
			}
		});
	});
};

var fileContentsPromise = getFileContentsPromise(inputFileName);

var cssFileContentsPromise = getFileContentsPromise('LyX.css');

var inlineCss = function (html) {
	return cssFileContentsPromise.then(function (css) {
		return juice.inlineContent(html, css);
	});
};

var getHighlightedCodePromise = function (code) {
	return new Promise(function (resolve, reject) {
		var options = {
			host: 'hilite.me',
			port: 80,
			path: '/api?' + querystring.stringify({code: code, lexer: 'scheme'}),
			method: 'POST'
		};
		
		var req = http.request(options, function (res) {
			res.setEncoding('utf8');
			
			var data = '';
			
			res.on('data', function (chunk) {
				data += chunk;
			});
			
			res.on('end', function () {
				resolve(data.replace(/\n/g, '<br/>'));
			})
		});
		
		req.on('error', function (e) {
			console.log('Error');
			reject(e.message);
		});
		
		req.end();		
	});
};

var writeHighlightedCodeToFile = function (contents) {
	return fs.writeFile(outputFileName, contents);	
};

var getLyxHtmlContents = function (fullHtml) {
	$ = cheerio.load(fullHtml);
	var globalWrapper = $('div#globalWrapper');
	var footer = globalWrapper.find('.footer');
	footer.remove(); 
	return globalWrapper.html();
};

var replaceSomeElements = function (html) {
	
	return html
		.replace(/\n/g, '')	
};

var replaceEachCodeFragment = function (html) {
	var $ = cheerio.load(html);
	var listings = $('pre.listing');
	var listingHightlightedPromises = [];
	listings.each(function (i) {
		
		var codeElement = $(this);
		var enclosingDiv = codeElement.parent();
		var code = $(this).text();
		var listingHighlightedPromise = getHighlightedCodePromise(code)
			.then(function (highlightedCode) {
				// Find the pre-element in the response from hilite.me...
				var preElementInHighlightedCode = $(highlightedCode).find('pre');
				
				// Add some spacing...
				preElementInHighlightedCode
					.css('margin', '20px 0px');
				
				// Replace the raw code with the highlighted code...
				enclosingDiv.replaceWith(preElementInHighlightedCode);
			}, function (error) {
				console.log(error);
			});
		listingHightlightedPromises.push(listingHighlightedPromise);
	});
	
	Promise.all(listingHightlightedPromises)
	.then(function () {
		return $.html();
	})
	.then(replaceSomeElements)
	.then(writeHighlightedCodeToFile, function (error) {
		console.log(error);
	});
		
};

fileContentsPromise
	.then(getLyxHtmlContents)
	.then(inlineCss)
	.then(replaceEachCodeFragment, function (error) {
		console.log(error);
	});
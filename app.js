
/**
 * Module dependencies.
 */

var express = require('express');

var app = module.exports = express.createServer(),
    hogan = require('hogan.js'),
    fs = require('fs'),
    templateDirectory = __dirname + "/views/",
    sharedTemplateDirectory = templateDirectory + "shared/",
    sharedTemplatesTemplatePath = templateDirectory + "sharedTemplates.mustache",
    sharedTemplateTemplate = hogan.compile(removeByteOrderMark(fs.readFileSync(sharedTemplatesTemplatePath, "utf8"))); 

// Remove utf-8 byte order mark, http://en.wikipedia.org/wiki/Byte_order_mark
function removeByteOrderMark(text) {
   if (text.charCodeAt(0) === 0xfeff) {
       return text.substring(1);
   }
   return text;
}

/**
 * The Express hogan template renderer.
 */
var hoganHtmlRenderer = {
    compile: function(source, options) {
        return function(options) {
            var template = hogan.compile(source);
            return template.render(options.context, options.partials);
        };
    }
};

/**
 * Reads and compiles hogan templates from the shared template 
 * directory to stringified javascript functions.
 */
function readSharedTemplates() {
    var sharedTemplateFiles = fs.readdirSync(sharedTemplateDirectory);

    // Here we'll stash away the shared templates compiled script (as a string) and the name of the template.
    app.sharedTemplates = [];

    // Hogan like it's partials as template contents rather than a path to the template file
    // so we'll stash each template in a partials object so they're available for use
    // in other templates.
    app.sharedPartials = {};

    // Iterate over each sharedTemplate file and compile it down to a javascript function which can be
    // used on the client
    sharedTemplateFiles.forEach(function(template, i) {
        var functionName = template.substr(0, template.lastIndexOf(".")), 
            fileContents = removeByteOrderMark(fs.readFileSync(sharedTemplateDirectory + template, "utf8"));

        // Stash the partial reference.
        app.sharedPartials[functionName] = fileContents;

        // Stash the compiled template reference.
        app.sharedTemplates.push({
            id: functionName,
            script: hogan.compile(fileContents, {asString: true}),
            // Since mustache doesn't boast an 'isLast' function we need to do that here instead.
            last: i === app.sharedTemplates.length - 1
        });
    });
}

function readSharedTemplatesMiddleware(req, res, next) {
    if (!app.sharedTemplates || app.settings.env === "development") {
        readSharedTemplates();
    }
    next();
}   

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  // Register the hogan renderer with the mustache file type.
  app.register(".mustache", hoganHtmlRenderer);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  app.use(express.errorHandler()); 
  // Load the templates only once in production
});

// Read the templates initially when starting up
readSharedTemplates();

/**
 * Request handler for pre-compiled hogan.js templates.
 *
 * This function uses a hogan template of it's own which renders
 * calls to Hogan.Tempate. See views/sharedTemplates.mustache.
 */
app.get("/templates.js", readSharedTemplatesMiddleware, function(req, res, next) {
    var content = sharedTemplateTemplate.render({
        templates: app.sharedTemplates 
    });
    res.contentType("application/javascript");
    res.send(content);
});

/**
 * Request handler for the homepage.
 *
 * Renders a hogan template on the server side which contains a form 
 * which will update the article section on the client using the
 * pre-compiled template.
 */
app.get("/", function(req, res, next) {
    res.render("layout.mustache", {
        context: {
            headline: "This is a server-side rendered headline",
            bodyText: "This is some bodytext"
        },
        partials: {
            "article": app.sharedPartials["article"] 
        } 
    });
});

app.listen(3000);
console.log("Express server listening on port %d", app.address().port);

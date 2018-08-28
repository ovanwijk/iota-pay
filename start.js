var express = require('express')
var serveStatic = require('serve-static')
var path = require('path')
var app = express()

app.use(serveStatic(path.join(__dirname, '')))
app.listen(3005);
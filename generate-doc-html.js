#!/usr/bin/env node
const fs = require('fs');
const showdown = require('devextreme-showdown');
const converter = new showdown.Converter();

const mdText = fs.readFileSync('./README.md').toString();
const htmlText = converter.makeHtml(mdText);

const fullHTML = `
<html lang="en">

  <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="https://vpsqr.com/assets/icons/favicon.ico">
    <title>PSQR CLI</title>

    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.1/css/all.min.css" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" rel="stylesheet"/>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/mdb-ui-kit/3.10.2/mdb.min.css" rel="stylesheet"/>
  </head>

  <body>
    <section class="container">
        ${htmlText}
    </section>

    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/mdb-ui-kit/3.10.2/mdb.min.js"></script>
</body>
</html>
`
fs.writeFileSync('./README.html', fullHTML);
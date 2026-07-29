const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const websiteRoot = path.resolve(__dirname);
const productImageRoot = path.resolve(__dirname, "../../docs/images/product");
const port = Number(process.env.PORT || 5192);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveSafePath(root, requestedPath) {
  const resolvedPath = path.resolve(root, requestedPath);
  const relativePath = path.relative(root, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

function sendFile(response, filePath) {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": filePath.endsWith(".html")
        ? "no-cache"
        : "public, max-age=3600",
      "Content-Length": stat.size,
      "Content-Type":
        contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );

  if (url.pathname.startsWith("/assets/product/")) {
    const filePath = resolveSafePath(
      productImageRoot,
      decodeURIComponent(url.pathname.slice("/assets/product/".length)),
    );

    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    sendFile(response, filePath);
    return;
  }

  const requestedPath =
    url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = resolveSafePath(websiteRoot, requestedPath);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, host, () => {
  console.log(`Roomark website local: http://127.0.0.1:${port}/`);
  console.log(`Roomark website LAN: http://<your-computer-ip>:${port}/`);
});

#!/usr/bin/env node
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// Function to find an available port
async function findAvailablePort(startPort = 5173) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, () => {
          reject(new Error(`Port ${port} in use`));
        });
        req.on("error", () => resolve(port));
        req.setTimeout(1000, () => reject());
      });
      return port;
    } catch (e) {
      continue;
    }
  }
  throw new Error("No available port found");
}

async function start() {
  try {
    const port = await findAvailablePort();
    console.log(`Using port ${port} for Vite`);

    // Start Vite
    const vite = spawn("npm.cmd", ["run", "dev:vite"], {
      cwd: __dirname,
      stdio: ["inherit", "inherit", "inherit"],
      shell: process.platform === "win32",
      env: { ...process.env, VITE_PORT: port },
    });

    // Wait a bit for Vite to start
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Start Electron - use node to run electron cli.js
    const electronCliPath = path.join(__dirname, "node_modules", "electron", "cli.js");
    const electron = spawn(process.execPath, [electronCliPath, "public/main.cjs"], {
      cwd: __dirname,
      stdio: ["inherit", "inherit", "inherit"],
      shell: false,
      env: { ...process.env, VITE_PORT: port, NODE_ENV: "development" },
    });

    // Handle process exits
    vite.on("exit", (code) => {
      console.log(`Vite exited with code ${code}`);
      electron.kill();
    });

    electron.on("exit", (code) => {
      console.log(`Electron exited with code ${code}`);
      vite.kill();
      process.exit(code);
    });
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

start();

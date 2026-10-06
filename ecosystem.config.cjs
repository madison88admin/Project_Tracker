module.exports = {
  apps: [{
    name: 'madison-dev-tracker',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3100
    }
  }]
};

import handler from '../api/monnify/init.js';

async function run() {
  const req = {
    method: 'POST',
    body: {
      userId: 'local-test-user',
      email: 'test@example.com',
      amount: 100,
      examType: 'LOCAL',
      subject: 'Demo'
    }
  };

  const res = {
    _status: 200,
    status(code) {
      this._status = code;
      return this;
    },
    json(payload) {
      console.log('RESPONSE', this._status, JSON.stringify(payload, null, 2));
      return payload;
    }
  };

  try {
    await handler(req, res);
  } catch (err) {
    console.error('Handler threw:', err);
    process.exitCode = 1;
  }
}

run();

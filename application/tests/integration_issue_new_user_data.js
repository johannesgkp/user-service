'use strict';

describe('REST API', () => {

  const config = require('../configuration'),
    jwt = require('../controllers/jwt'),
    db = require('../database/helper');
  let server;
  require('chai').should();
  require('chai').use(require('chai-datetime'));
  let jwtHeader, userid;

  before(() => {
    //Clean everything up before doing new tests
    Object.keys(require.cache).forEach((key) => delete require.cache[key]);
    let hapi = require('hapi');
    server = new hapi.Server();
    server.connection({
      host: 'localhost',
      port: 3000
    });
    return server.register(require('hapi-auth-jwt2')).then(() => {
      server.auth.strategy('jwt', 'jwt', {
        key: config.JWT.SERIAL,
        validateFunc: jwt.validate,
        verifyOptions: {
          algorithms: [ config.JWT.ALGORITHM ],
          ignoreExpiration: true
        },
        headerKey: config.JWT.HEADER
      });

      server.auth.default('jwt');
      require('../routes.js')(server);
      return db.cleanDatabase('slidewiki').then(() => {
        let options = {
          method: 'POST',
          url: '/register',
          headers: {
            'Content-Type': 'application/json'
          },
          payload: minimalData
        };
        return server.inject(options);
      }).then(() => {
        let options = {
          method: 'POST',
          url: '/login',
          headers: {
            'Content-Type': 'application/json'
          },
          payload: {email: minimalData.email, password: minimalData.password}
        };
        return server.inject(options);
      }).then((response) => {
        jwtHeader = response.headers['----jwt----'];
        let payload = JSON.parse(response.payload);
        userid = payload.userid;
      });
    });

  });

  const minimalData = {
    username: 'jdoe',
    email: 'jdoe@test.test',
    password: '12345678',
    language: 'en_EN',
  };

  const fullData = {
    username: 'jdoe',
    email: 'jdoe@test.test',
    language: 'en_EN',
    forename: 'John',
    surname: 'Doe',
    country: 'Albany',
    picture: 'http://test.test',
    description: 'test',
    organization: 'Test'
  };

  let options = {
    method: 'PUT',
    url: '/user/', //+profile at the end
    headers: {
      'Content-Type': 'application/json',
      '----jwt----': ''
    },
  };

  let options2 = {
    method: 'GET',
    url: '/user/', //+profile at the end
    headers: {
      'Content-Type': 'application/json',
      '----jwt----': ''
    },
  };

  let options3 = {
    method: 'POST',
    url: '/register',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  context('when trying to update a users data', () => {
	
    it('it should reply with 200 in case data is valid', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(200);
        response.payload.should.be.a('string').and.be.empty;
      }).then(() => {
        options2.url += userid + '/profile';
        options2.headers['----jwt----'] = jwtHeader;
        return server.inject(options2);
      }).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(200);
        response.payload.should.be.a('string').and.not.be.empty;
        let payload = JSON.parse(response.payload);
        payload.should.be.an('object').and.include(fullData);
      });
    });

    //it('it should reply 403 for a not existing user', () => { //QUESTION Or better Not Found?
    it('it should reply 404 for a not existing user', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += 11 + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(404);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Not Found');
      });
    });

    it('it should reply 401 in case the JWT is missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.payload = JSON.parse(JSON.stringify(fullData));
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(401);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Unauthorized');
      });
    });

    it('it should reply 400 in case all parameters are missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = {};
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the language parameter is missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      delete opt.payload.language;
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the email parameter is missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      delete opt.payload.email;
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the username parameter is missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      delete opt.payload.username;
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the id parameter is missing', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(404);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error');
        payload.error.should.equal('Not Found');
      });
    });

    it('it should reply 400 in case the id parameter is of wrong type', () => {//QUESTION Or Unprocessable Entity 422 ?
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += 'abc' + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the email parameter is not an email', () => {//QUESTION Or Unprocessable Entity 422 ?
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      opt.payload.email = 'abc@abc';
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    it('it should reply 400 in case the language parameter is not a language', () => {//QUESTION Or Unprocessable Entity 422 ?
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      opt.payload.language = 'abc';
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(400);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Bad Request');
      });
    });

    /*
	* it('it should reply 403 in case the username shall be exchanged', () => { //TODO is this correct?
    * in the documentation its says: 406 	Username could not be changed with the API.
    * this is no standart httpStatusCode
    */
   it('it should reply 406 in case the username shall be exchanged', () => {
      let opt = JSON.parse(JSON.stringify(options));
      opt.url += userid + '/profile';
      opt.headers['----jwt----'] = jwtHeader;
      opt.payload = JSON.parse(JSON.stringify(fullData));
      opt.payload.username = '12abc';
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(406);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        //payload.error.should.equal('Not Acceptable');
      });
    });

   it('it should reply 409 in case the  new emailAdress is already taken', () => { 
      let opt = JSON.parse(JSON.stringify(options3));
      opt.payload = {
			username: 'jdoe2',
			email: 'already@existing.test',
			password: '12345678',
			language: 'en_EN',
		  };
      return server.inject(opt).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(200);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.be.an('object').and.contain.keys('userid');
        payload.userid.should.be.a('number');
      }).then(() => {
        let opt1 = JSON.parse(JSON.stringify(options));
        opt1.url += userid + '/profile';
        opt1.headers['----jwt----'] = jwtHeader;
        opt1.payload = {
			username: 'jdoe',
			email: 'already@existing.test',
			language: 'en_EN',
			forename: 'John',
			surname: 'Doe',
			country: 'Albany',
			picture: 'http://test.test',
			description: 'test',
			organization: 'Test'
		  };
        return server.inject(opt1);
      }).then((response) => {
        response.should.be.an('object').and.contain.keys('statusCode', 'payload');
        response.statusCode.should.equal(409);
        response.payload.should.be.a('string');
        let payload = JSON.parse(response.payload);
        payload.should.contain.keys('statusCode', 'error', 'message');
        payload.error.should.equal('Conflict');
      });
    });	
  });
});

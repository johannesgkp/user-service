/*
Handles the requests by executing stuff and replying to the client. Uses promises to get stuff done.
*/

'use strict';

const boom = require('boom'), //Boom gives us some predefined http codes and proper responses
  co = require('../common'),
  userCtrl = require('../database/user'),
  mongodb = require('mongodb'),
  config = require('../configuration'),
  jwt = require('./jwt');

module.exports = {
  register: (req, res) => {
    let user = {
      surname: decodeURI(req.payload.surname),
      forename: decodeURI(req.payload.forename),
      username: decodeURI(req.payload.username),
      email: decodeURI(req.payload.email),
      password: decodeURI(req.payload.password),
      languages: [decodeURI(req.payload.language)],
      defaults: [{
        language: decodeURI(req.payload.language)
      }]
    };

    //check if username already exists
    return isUsernameAlreadyTaken(user.username)
      .then((isTaken) => {
        console.log('username already taken: ', user.username, isTaken);
        if (isTaken === false) {
          //TODO: check email

          return userCtrl.create(user)
            .then((result) => {
              //console.log('register: user create result: ', result);

              if (result[0] !== undefined && result[0] !== null) {
                //Error
                return res(boom.badData('registration failed because data is wrong: ', co.parseAjvValidationErrors(result)));
              }

              if (result.insertedCount === 1) {
                //success
                return res({
                  userid: result.insertedId.toString()
                });
              }

              res(boom.badImplementation());
            })
            .catch((error) => {
              console.log('register: catch: ', error);
              res(boom.badImplementation('Error', error));
            });
        } else {
          return res(boom.badData('The username is already taken'));
        }
      })
      .catch((error) => {
        res(boom.badImplementation('Error', error));
      });
  },

  login: (req, res) => {
    const query = {
      username: decodeURI(req.payload.username),
      password: decodeURI(req.payload.password)
    };

    return userCtrl.find(query)
      .then((cursor) => cursor.toArray())
      .then((result) => {
        //console.log('login: result: ', result);

        switch (result.length) {
          case 0:
            res(boom.notFound('credentials are wrong'));
            break;
          case 1:
            //TODO: call authorization service for OAuth2 token

            res({
              userid: result[0]._id.toString(),
              access_token: 'dummy',
              expires_in: 0
            })
              .header(config.JWT.HEADER, jwt.createToken({
                userid: result[0]._id.toString()
              }));
            break;
          default:
            res(boom.badImplementation('Found multiple users'));
            break;
        }
      })
      .catch((error) => {
        res(boom.notFound('Wrong user id', error));
      });
  },

  getUser: (req, res) => {
    //check if the request comes from the right user (have the right JWT data)
    const isUseridMatching = isJWTValidForTheGivenUserId(req);
    if (!isUseridMatching) {
      return res(boom.unauthorized('You cannot get detailed information about another user'));
    }

    return userCtrl.read(new mongodb.ObjectID(decodeURI(req.params.id)))
      .then((user) => {
        //console.log('getUser: got user:', user);
        if (user !== undefined && user !== null && user.username !== undefined)
          return res(prepareDetailedUserData(user));
        else {
          return res(boom.notFound());
        }
      })
      .catch((error) => {
        console.log('getUser: error', error);
        res(boom.notFound('Wrong user id', error));
      });
  },

  deleteUser: (req, res) => {
    let userid = new mongodb.ObjectID(decodeURI(req.params.id));

    //check if the user which should be deleted have the right JWT data
    const isUseridMatching = isJWTValidForTheGivenUserId(req);
    if (!isUseridMatching) {
      return res(boom.unauthorized('You cannot delete another user'));
    }

    return userCtrl.delete(userid)
      .then((result) => {
        if (result.result.n === 1) {
          return res({
            success: true
          });
        }

        res(boom.notFound('Deletion failed - no matched id'));
      })
      .catch((error) => {
        res(boom.badImplementation('Deletion failed', error));
      });
  },

  //User profile
  updateUserPasswd: (req, res) => {
    let oldPassword = req.payload.oldPassword;
    let newPassword = req.payload.newPassword;
    const user__id = new mongodb.ObjectID(decodeURI(req.params.id));

    //check if the user which should be updated have the right JWT data
    const isUseridMatching = isJWTValidForTheGivenUserId(req);
    if (!isUseridMatching) {
      return res(boom.unauthorized('You cannot change the password of another user'));
    }

    //check if old password is correct
    return userCtrl.find({
      _id: user__id,
      password: oldPassword
    })
      .then((cursor) => cursor.count())
      .then((count) => {
        switch (count) {
          case 0:
            res(boom.notFound('There is no user with this Id and password'));
            break;
          case 1:
            const findQuery = {
                _id: user__id,
                password: oldPassword
              },
              updateQuery = {
                $set: {
                  password: newPassword
                }
              };

            return userCtrl.partlyUpdate(findQuery, updateQuery)
              .then((result) => {
                //console.log('handler: updateUserPasswd:',  result);
                if (result.result.nModified === 1) {
                  //success
                  return res();
                }

                res(boom.badImplementation());
              })
              .catch((error) => {
                res(boom.notFound('Update failed', error));
              });
            break;
          default:
            //should not happen
            res(boom.badImplementation('Found multiple users'));
            break;
        }
      });
  },

  updateUserProfile: (req, res) => {
    let user = req.payload;
    user._id = new mongodb.ObjectID(decodeURI(req.params.id));

    //check if the user which should be updated have the right JWT data
    const isUseridMatching = isJWTValidForTheGivenUserId(req);
    if (!isUseridMatching) {
      return res(boom.unauthorized('You cannot change the user profile of another user'));
    }

    let updateCall = function() {
      const findQuery = {
          _id: user._id
        },
        updateQuery = {
          $set: {
            email: decodeURI(req.payload.email),
            username: decodeURI(req.payload.username),
            surname: decodeURI(req.payload.surname),
            forename: decodeURI(req.payload.forename),
            current_language: decodeURI(req.payload.language),
            hometown: decodeURI(req.payload.hometown),
            location: decodeURI(req.payload.location),
            picture: decodeURI(req.payload.picture),
            desription: decodeURI(req.payload.desription),
            birthday: decodeURI(req.payload.birthday)
          }
        };

      return userCtrl.partlyUpdate(findQuery, updateQuery)
        .then((result) => {
          //console.log('handler: updateUserProfile: updateCall:', updateQuery,  result.result);
          if (result.result.nModified === 1) {
            //success
            return res();
          }

          return res(boom.badImplementation());
        })
        .catch((error) => {
          return res(boom.notFound('Profile update failed', error));
        });
    };

    //find user and check if username has changed
    return userCtrl.find({_id: user._id})
      .then((cursor) => cursor.project({username: 1}))
      .then((cursor2) => cursor2.next())
      .then((document) => {
        //console.log('handler: updateUserProfile: got user as document', document);

        if (document === null)
          return res(boom.badImplementation());

        const oldUsername = document.username;

        if (decodeURI(req.payload.username) === oldUsername) {
          return updateCall();
        }
        else {
          //check if username already exists
          return isUsernameAlreadyTaken(user.username)
            .then((isTaken) => {
              if (isTaken === false) {
                return updateCall();
              } else {
                return res(boom.badData('The username is already taken'));
              }
            });
        }
      })
      .catch((error) => {
        //console.log('handler: updateUserProfile: Error while getting user');
        return res(boom.badImplementation(error));
      });
  },

  getPublicUser: (req, res) => {
    return userCtrl.read(new mongodb.ObjectID(decodeURI(req.params.id)))
      .then((user) => {
        console.log('handler: getPublicUser: ', user);
        if (user !== undefined && user !== null && user.username !== undefined)
          res(preparePublicUserData(user));
        else {
          res(boom.notFound());
        }
      })
      .catch((error) => {
        console.log('handler: getPublicUser: Error', error);
        res(boom.notFound('Wrong user id', error));
      });
  },

  checkUsername: (req, res) => {
    const username = decodeURI(req.params.username);

    return userCtrl.find({
      username: username
    })
      .then((cursor) => cursor.count())
      .then((count) => {
        //console.log('checkUsername: cursor.count():', count);
        if (count === 0) {
          return res({taken: false, alsoTaken: []});
        }

        const query = {
          username: {
            $regex: username
          }
        };

        return userCtrl.find(query)
          .then((cursor1) => cursor1.project({username: 1}))
          .then((cursor2) => cursor2.maxScan(40))
          .then((cursor3) => cursor3.toArray())
          .then((array) => {
            //console.log('handler: checkUsername: similar usernames', array);
            let alreadyTaken = array.reduce((prev, curr) => {
              prev.push(curr.username);
              return prev;
            }, []);
            return res({taken: true, alsoTaken: alreadyTaken});
          });
      })
      .catch((error) => {
        console.log('handler: checkUsername: error', error);
        res(boom.badImplementation(error));
      });
  }
};

function isUsernameAlreadyTaken(username) {
  let myPromise = new Promise((resolve, reject) => {
    return userCtrl.find({
      username: username
    })
      .then((cursor) => cursor.count())
      .then((count) => {
        console.log('isUsernameAlreadyTaken: cursor.count():', count);
        if (count > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
  return myPromise;
}

//Remove attributes of the user data object which should not be transmitted
function prepareDetailedUserData(user) {
  const hiddenKeys = ['password'];
  let minimizedUser = {};

  let key;
  for (key in user) {
    const found = hiddenKeys.find((hiddenKey) => {
      if (key === hiddenKey)
        return true;

      return false;
    });
    if (found === undefined) {
      minimizedUser[key] = user[key];
    }
  }

  return minimizedUser;
}

//Remove attributes of the user data object which should not be transmitted for the user profile
function preparePublicUserData(user) {
  const shownKeys = ['_id', 'username', 'organization', 'picture', 'description'];
  let minimizedUser = {};

  let key;
  for (key in user) {
    const found = shownKeys.find((shownkey) => {
      if (key === shownkey)
        return true;

      return false;
    });
    if (found !== undefined) {
      minimizedUser[key] = user[key];
    }
  }

  return minimizedUser;
}

function isJWTValidForTheGivenUserId(req) {
  let jwt_userid = '';
  try {
    jwt_userid = req.auth.credentials.userid;
  } catch (e) {}
  //console.log(decodeURI(req.params.id), 'vs', jwt_data);
  if (decodeURI(req.params.id) !== jwt_userid) {
    return false;
  }
  return true;
}

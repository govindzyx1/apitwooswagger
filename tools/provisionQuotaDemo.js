/*jslint node:true, strict:implied, esversion:9 */
/* global Buffer */

// provisionQuotaDemo.js
// ------------------------------------------------------------------
// provision the quota demo.
// a dev, and an app. Then invoke it.
//
// Copyright 2017-2019 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// last saved: <2019-December-17 11:32:26>

const edgejs     = require('apigee-edge-js'),
      common     = edgejs.utility,
      util       = require('util'),
      apigeeEdge = edgejs.edge,
      sprintf    = require('sprintf-js').sprintf,
      Getopt     = require('node-getopt'),
      request    = require('request'),
      path       = require('path'),
      proxyDir   = path.resolve(__dirname, '..'),
      defaults   = { timeunit: 'minute' },
      version    = '20191217-1122',
      getopt     = new Getopt(common.commonOptions.concat([
        ['U' , 'timeunit=ARG', 'Optional. Time Unit. minute, hour, day. default:' + defaults.timeunit],
        ['R' , 'reset', 'Optional. Reset, delete all the assets previously created by this script'],
        ['e' , 'env=ARG', 'the Edge environment(s) to which to deploy the proxy.']
      ])).bindHelp();

// ========================================================
function randomString(L){
  L = L || 18;
  let s = '';
  do {s += Math.random().toString(36).substring(2, 15); } while (s.length < L);
  return s.substring(0,L);
}

function getToken(result) {
  let apiserver = sprintf('https://%s-%s.apigee.net', opt.options.org, opt.options.env),
      s = sprintf('%s:%s', result.consumerKey, result.consumerSecret),
      options = {
        url: sprintf('%s/quotatest/oauth2-cc/token', apiserver),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'authorization' : 'Basic ' + new Buffer.from(s).toString('base64')
        },
        body: 'grant_type=client_credentials'
      },
      getHeaderArgs = h => Object.keys(h).map(k => sprintf('-H "%s: %s"', k, h[k])).join(' ');

  return new Promise( (resolve, reject) => {
    console.log("# Get new token");
    console.log(sprintf('curl -i -X POST \\\n' +
                        '   -H content-type:application/x-www-form-urlencoded \\\n' +
                        '   -u ${client_id}:${client_secret} \\\n' +
                        '   -d "%s" \\\n'+
                        '   %s\n',
                        options.body,
                        options.url));

    request.post(options, function (error, response, body) {
      if (error) { return reject(error); }
      if (body){
        body = JSON.parse(body);
        return resolve({
          accessToken: body.access_token,
          consumerKey: result.consumerKey
        });
      }
    });
  });
}

function showNextSteps(result) {
  let apiserver = sprintf('https://%s-%s.apigee.net', opt.options.org, opt.options.env);
  return new Promise( (resolve, reject) => {
    console.log("# Invoke API with Token");
    console.log(sprintf('curl -i -H "Authorization: %s" %s\n',
                        'Bearer ' + result.accessToken,
                        sprintf('%s/quotatest/ops/withtoken', apiserver)));
    console.log("# Invoke API with Key");
    console.log(sprintf('curl -i -H APIKey:%s %s\n',
                        result.consumerKey,
                        sprintf('%s/quotatest/ops/withkey', apiserver)));
    return resolve({});
  });
}

console.log(
  'Apigee Edge Quota Test provisioning tool, version: ' + version + '\n' +
    'Node.js ' + process.version + '\n');

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

common.logWrite('start');

// process.argv array starts with 'node' and 'scriptname.js'
var opt = getopt.parse(process.argv.slice(2));

let env = opt.options.env || process.env.ENV;
if ( ! env) {
  console.log('You must provide an environment to which to deploy the proxy.');
  getopt.showHelp();
  process.exit(1);
}

common.verifyCommonRequiredParameters(opt.options, getopt);

const constants = {
        discriminators : {
          proxy        : 'quotatest',
          product      : 'QuotaTest-Example-Product',
          developer    : 'QuotaTest-Example-Developer@example.com',
          developerapp : 'QuotaTest-Example-App-1'
        },
        note           : 'created '+ (new Date()).toISOString() + ' for Quota Test Example',
        scopes         : ['A', 'B', 'C'],
        appExpiry      : '210d'
      },
      connectOptions = {
        mgmtServer : opt.options.mgmtserver,
        org        : opt.options.org,
        user       : opt.options.username,
        password   : opt.options.password,
        no_token   : opt.options.notoken,
        verbosity  : opt.options.verbose || 0
      };

const productName = constants.discriminators.product;

const entityOptions = {
        proxies : {
          find: result => result.find( e => e == constants.discriminators.proxy),
          del: {
            name: constants.discriminators.proxy
          }
        },
        products: {
          find: result => result.find( e => e == productName),
          create: {
            productName   : productName,
            description   : 'Test Product for Quota Test Example',
            scopes        : constants.scopes,
            attributes    : { access: 'public', note: constants.note },
            approvalType  : 'auto',
            proxies       : [ 'quotatest' ],
            quota         : 5,
            quotaInterval : 1,
            quotaTimeUnit : opt.options.timeunit || defaults.timeunit
          },
          del: {
            name: productName,
            productName: productName
          }
        },
        developers: {
          find: function(result){
            return (result.find( e => e == entityOptions.developers.del.developerEmail));
          },
          create: {
            developerEmail : constants.discriminators.developer,
            lastName       : 'Developer',
            firstName      : 'QuotaTest-Example',
            userName       : 'QuotaTest-Example-Developer',
            attributes     : { note: constants.note }
          },
          del: { developerEmail: constants.discriminators.developer }
        },
        developerapps: {
          find: function(result){
            return (result.find( e => e == entityOptions.developerapps.del.name));
          },
          get: {
            developerEmail : constants.discriminators.developer
          },
          create: {
            appName      : constants.discriminators.developerapp,
            developerEmail : constants.discriminators.developer,
            productName,
            description  : 'Test Product for Quota Test Example',
            scopes       : constants.scopes,
            attributes   : { access: 'public', note: constants.note },
            approvalType : 'auto'
          },
          del:{
            name: constants.discriminators.developerapp,
            appName: constants.discriminators.developerapp,
            developerEmail: constants.discriminators.developer
          }
        }
      };

apigeeEdge
  .connect(common.optToOptions(opt))
  .then( org => {
    common.logWrite('connected');
    if (opt.options.reset) {
      let conditionallyDeleteEntity = function(entityType) {
            let collectionName = (entityType.endsWith('s')) ? entityType : entityType + 's';
            return org[collectionName].get(entityOptions[collectionName].get || {})
            .then( result => {
              //console.log('GET Result: ' + JSON.stringify(result));
              let findFn = entityOptions[collectionName].find;
              if (findFn(result)) {
                return org[collectionName].del(entityOptions[collectionName].del);
              }
              return Promise.resolve({});
            })
            .catch( (e, result) => {
              if (e.message.indexOf('bad status: 404') >= 0) {
                return Promise.resolve({});
              }
              console.log('unexpected error: ' + util.format(e));
              console.log('?? : ' + JSON.stringify(result));
              return Promise.reject(e);
            });
          },
          conditionallyUndeploy = function(options) {
            return org.proxies.getDeployments(options)
              .then( result => {
                //console.log('GET Result: ' + JSON.stringify(result));
                return org.proxies.undeploy(options);
              })
              .catch( (e, result) => {
                //console.log('catch : ' + e.message);
                if (e.message.indexOf('bad status: 404') >= 0) {
                  return Promise.resolve({});
                }
                console.log('unexpected error: ' + util.format(e));
                console.log('?? : ' + JSON.stringify(result));
                return Promise.reject(e);
              });
          };

      return conditionallyDeleteEntity('developerapp')
        .then( _ => conditionallyDeleteEntity('developer'))
        .then( _ => conditionallyDeleteEntity('product'))
        .then( _ => conditionallyUndeploy({name:'quotatest', environment:env}) )
        .then( _ => conditionallyDeleteEntity('proxies'))
        .then( _ => common.logWrite('ok. demo assets have been deleted') );
    }

    const conditionallyCreateEntity = function(entityType) {
            let collectionName = entityType + 's';
            return org[collectionName].get(entityOptions[collectionName].get || {})
            .then( result => {
              let findFn = entityOptions[collectionName].find;
              //console.log('GET Result: ' + JSON.stringify(result));
              if (findFn(result)) {
                return Promise.resolve(result) ;
              }
              return org[collectionName].create(entityOptions[collectionName].create);
            });
          },

    conditionallyImport = function() {
      return org.proxies.get({name:constants.discriminators.proxy})
        .then( result => Promise.resolve({}) )
        .catch( e => {
            if (e.message.indexOf('bad status: 404') >= 0) {
              return org.proxies.import({source:proxyDir});
            }
            console.log('unexpected error: ' + util.format(e));
            return Promise.reject(e);
        });
    },

    conditionallyDeploy = function() {
      return org.proxies.getDeployments({name:constants.discriminators.proxy, environment:env})
        .then( result => {
          console.log('deployments: ' + JSON.stringify(result));
          if (result.environment.length == 0 || !result.environment.find( e => e.name == opt.options.env)) {
              return org.proxies.deploy({name:constants.discriminators.proxy, environment:env});
          }
          return Promise.resolve({});
        })
        .catch( e => {
            console.log('unexpected error: ' + util.format(e));
            return Promise.reject(e);
        });
    };

    return conditionallyImport()
      .then( _ => conditionallyDeploy())
      .then( _ => conditionallyCreateEntity('product'))
      .then( _ => conditionallyCreateEntity('developer'))
      .then( _ => conditionallyCreateEntity('developerapp'))
      .then( result => {
        common.logWrite(sprintf('app name: %s', result.name));
        console.log(sprintf('\n\nORG=%s', opt.options.org));
        console.log(sprintf('ENV=%s', opt.options.env));
        console.log(sprintf('client_id=%s', result.credentials[0].consumerKey));
        console.log(sprintf('client_secret=%s', result.credentials[0].consumerSecret));
        console.log();
        return Promise.resolve({
          consumerKey: result.credentials[0].consumerKey,
          consumerSecret: result.credentials[0].consumerSecret
        });
      })
      .then( getToken )
      .then( showNextSteps );
  })

  .catch( e => console.log('while provisioning, error: ' + util.format(e)) );

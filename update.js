var base = require('./base')
  , xml2js = require('xml2js').parseString
  , cheerio = require('cheerio')
  , apps = require('./apps.js')
  , stars = require('./data/stars.js');

module.exports = {
  members: function(req, page) {
    (function rec(req, page){
      // numeric group id? they have different urls
      var name = req.data.name;
      var url = /^\d{18}$/.test(name) ? ('gid/' + name) : ('groups/' + name);
      base.fetch('http://steamcommunity.com/' + url + '/memberslistxml/?xml=1&p=' + page, function(err, content) {
        if(err) {
          console.log('Member fetching error for ' + url + '\n' + err);
          req.socket.emit('err', err.toString());
        } else {
          xml2js(content, function(err, res) {
            if(err || !res) {
              console.log('Member xml2js error for ' + url + '\n' + err);
              // Steam error page maybe.
              $ = cheerio.load(content);
              var message = $('h3').text();
              console.log('> ' + message);
              req.socket.emit('err', message);
              return;
            } else {
              res = res.memberList;

              if(res.currentPage == 1) {
                apps.title(req, res.groupDetails[0].groupName, req.data.index)
              }
              req.socket.emit('m', res.members[0].steamID64);
              if(parseInt(res.currentPage) < parseInt(res.totalPages)) {
                rec(req, page + 1);
              } else {
                req.socket.emit('k');
              }
            }
          });
        }
      });
    })(req, page);
  },

  friends: function(req) {
    var id = req.data.name.substr(8);
    var url = /^\d{17}$/.test(id) ? ('profiles/' + id) : ('id/' + id);
    base.fetch('http://steamcommunity.com/' + url + '/friends/?xml=1', function(err, content) {
      if(err) {
        console.log('Friends fetching error for ' + url + '\n' + err);
        return;
      }
      
      xml2js(content, function(err, res) {
        if(err || !res || !res.friendsList) {
          console.log('Friends xml2js error for ' + url + '\n' + err);
          return;
        }

        res = res.friendsList;
        apps.title(req, 'Friends of ' + res.steamID, req.data.index);
        req.socket.emit('m', res.friends[0].friend);
        req.socket.emit('k');
      })
    });
  },

  list: function(req) {
    var ids = req.data.name.substr(7).split(',');
    apps.title(req, 'VS', req.data.index);
    req.socket.emit('m', ids);
    req.socket.emit('k');
  },

  // Grab a wishlist for a single person.
  wishlist: function(req) {
    var url = /^\d{17}$/.test(req.data) ? ('profiles/' + req.data) : ('id/' + req.data);
    base.fetch('http://steamcommunity.com/' + url + '/wishlist?cc=us', function(err, res) {
      var ignore;
      if(err) {
        console.log('Error when fetching ' + url + ': ' + err);
        req.socket.emit('err', 'Error when fetching ' + url + ': ' + err);
        ignore = true;
      }
      $ = cheerio.load(res);

      // trading card profile
      var name = $('.profile_small_header_name').text().trim();

      var games = [];
      $('.wishlistRow').each(function(i, elem) {
        // Reduce this to the App ID
        var obj = $(this);
        var appLink = obj.find('.gameListRowLogo').children('a').first();
        var appID = parseInt(appLink.attr('href').substr(30));
        games[i] = appID;

        // ensure an entry in our app db.
        apps.update(appID, obj, appLink);
      });
      req.socket.emit('u', {name: name, profile: req.data, games: games, star: stars.indexOf(req.data) >= 0, ignore: ignore});
    });
  },
  // Game info for the wishlist
  games: function(req) {
    requested = {};
    for(var i = 0; i < req.data.fetch.length; ++ i) {
      requested[req.data.fetch[i]] = apps.get(req.data.fetch[i]);
    }
    req.socket.emit('games!', {games: requested, profile: req.data.profile});
  },

  // Check if this game is owned by this person in particular.
  owned: function(req) {
    if (/^\d{17}$/.test(req.data)) {
      var key = require('./key.json').apiKey;
      var url = 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=' + key + '&steamid=' + req.data;
      base.fetch(url, function(err, res) {
        if(err || !res) {
          req.socket.emit('owned!', {profile: req.data, games: null, name: '(?)'});
        } else {
          try {
            var response = JSON.parse(res),
                games,
                owned = {};
            if (response.response) {
              games = response.response.games;
              for(var i = 0; i < games.length; ++ i) {
                owned[games[i].appid] = true;
              }

              // wat an idjet
              base.fetch('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + key + '&steamids=' + req.data, function (err, res) {
                if (res) {
                  var response = JSON.parse(res);
                  req.socket.emit('owned!', {
                    profile: req.data,
                    games: owned,
                    name: response.response.players[0].personaname,
                    star: stars.indexOf(req.data) >= 0
                  });
                }
              });
            }
          } catch(e) {
            console.log('Error when trying to work with:');
            console.log(res);
            console.log('Error: ' + e)
          }
        }
      });
    }
  }
}

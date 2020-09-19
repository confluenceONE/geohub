var async = require('async')
var request = require('./request')

/**
 * get geojson from a github repository file or directory
 *
 * @param  {object}   options - user, repo, path (optional), branch (optional), token (optional)
 * @param  {Function} callback - err, data
 */
function repo (options, callback) {
  var user = options.user
  var repo = options.repo
  var path = options.path || null
  var branch = options.branch || 'master'
  var token = options.token || null

  if (!user || !repo) {
    return callback(new Error('must specify user, repo'))
  }

  if (path) {
    var contentsUrl = '/repos/' + user + '/' + repo + '/contents/'

    // debug
    console.log('1. Has path ' + path)
    // Update request with access token in headers
    // This is geohubRequest
    return request({
      url: contentsUrl,
      qs: {
        ref: branch
      },
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: 'token ' + token
      }
    }, function (err, data) {
      if (err) {
        var msg = 'Error requesting data from ' + contentsUrl + ': ' + err.message + ' [contentsUrl]' + contentsUrl + ' [token]' + token
        return callback(new Error(msg))
      }
      // debug
      console.log('2. Request OK ')

      var isDir = false
      // assume the extension of the requested file is '.geojson', unless proven otherwise
      var extension = '.geojson'

      data.forEach(function (f) {
        // find out the extension of the file requested by the user
        var filenameArray = f.name.split('.')
        if (path === filenameArray[0]) {
          extension = '.' + filenameArray[1]
        }

        if (f.name === path && f.type === 'dir') isDir = true
      })

      if (isDir) {
        var url = '/repos/' + user + '/' + repo + '/contents/' + path
        // debug
        console.log('3a. Url ' + url)
        return request({
          url: url,
          qs: {
            ref: branch
          },
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'token ' + token
          }
        }, function (err, json) {
          if (err) return callback(err)

          var files = []

          json.forEach(function (file) {
            if (file.name.match(/geojson/)) {
              files.push(file)
            }
          })
          // debug
          console.log('4. number of files ' + files.length.toString())
          if (files.length) {
            return repoFiles({
              url: 'https://raw.github.com/' + user + '/' + repo + '/' + branch + '/' + path + '/',
              files: files,
              headers: {
                Accept: 'application/vnd.github.v3+json',
                Authorization: 'token ' + token
              }
            }, callback)
          }

          callback(new Error('could not find any geojson files at ' + url))
        })
      }

      // for public raw.github.com/
      // for private raw.githubusercontent.com/
      var urls = [
        'https://api.github.com/repos/' + user + '/' + repo + '/contents/' + path + extension,
        'https://raw.githubusercontent.com/' + user + '/' + repo + '/' + branch + '/' + path + extension
      ]
      console.log('3b. Url ' + urls)
      async.map(urls, function (url, cb) {
        request({
          url: url,
          qs: {
            ref: branch
          },
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'token ' + token
          }
        }, cb)
      }, function (err, files) {
        if (err) return callback(err)

        var file = files[0]
        var json = files[1]
        var name = file.name
        var sha = file.sha
        var geojson = null

        if (json.type && json.type === 'FeatureCollection') {
          json.name = name
          json.sha = sha
          geojson = json
        }

        if (geojson) return callback(null, geojson)
        callback(new Error('could not find any geojson: ' + err.message))
      })
    })
  }

  var url = '/repos/' + user + '/' + repo + '/contents'

  request({
    url: url,
    qs: {
      ref: branch
    },
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: 'token ' + token
    }
  }, function (err, json) {
    if (err) return callback(err)

    var files = []

    json.forEach(function (file) {
      if (file.name.match(/geojson/)) {
        files.push(file)
      }
    })

    if (files.length) {
      return repoFiles({
        url: 'https://raw.github.com/' + user + '/' + repo + '/' + branch + '/',
        files: files
      }, callback)
    }

    callback(new Error('could not find any geojson files at ' + url))
  })
}

/**
 * get the SHA of a file in a github repository
 *
 * @param  {object}   options - user, repo, path (optional), branch (optional), token (optional)
 * @param  {Function} callback - err, sha
 */
function repoSha (options, callback) {
  var user = options.user
  var repo = options.repo
  var path = options.path || null
  var branch = options.branch || 'master'
  var token = options.token || null

  if (!user || !repo || !path) {
    return callback(new Error('must specify user, repo, path'))
  }

  var url = '/repos/' + user + '/' + repo + '/contents/' + path

  request({
    url: url,
    qs: {
      ref: branch
    },
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: 'token ' + token
    }
  }, function (err, json) {
    if (err) return callback(err)
    if (json.message) return callback(new Error(json.message))
    if (json.sha) return callback(null, json.sha)
    callback(new Error('could not get sha for ' + url))
  })
}

/**
 * get geojson files from a specific raw.github.com repo directory URL
 *
 * @private
 * @param  {object}   options - url, headers, files
 * @param  {Function} callback - err, data
 */
function repoFiles (options, callback) {
  var url = options.url
  var files = options.files
  var token = options.token

  if (!url || !files) {
    return callback(new Error('must specify url, files'))
  }

  var data = []

  async.forEachOf(files, function (item, key, callback) {
    request({
      url: url + item.name,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: 'token ' + token
      }
    }, function (err, json) {
      if (err) return callback(err)

      if (json && json.type && json.type === 'FeatureCollection') {
        json.name = item.name
        json.sha = item.sha
        data.push(json)

        return callback(null)
      }

      callback(new Error('problem accessing file ' + url + '/' + key))
    })
  }, function (err) {
    if (err) return callback(err)
    callback(null, data)
  })
}

module.exports = {
  repo: repo,
  repoSha: repoSha
}

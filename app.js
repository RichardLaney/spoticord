const DiscordRPC = require('discord-rpc'),
      spotifyWeb = require('./spotify'),
      log = require("fancy-log"),
      events = require('events'),
      fs = require('fs');

const keys = require('./keys.json');

/**
 * Check if user is blocking open.spotify.com before establishing RPC connection
 * Works only on Linux based systems that use /etc/hosts, if not this not provided
 * user will be in loop of ECONNRESET [changed address]:80 or recieve false data.
 **/
function checkHosts (file) {
  if (file.includes("open.spotify.com")) throw new Error("Arr' yer be pirating, please remove \"open.spotify.com\" rule from your hosts file.");
}
if (process.platform !== "win32") {
      if (fs.existsSync("/etc/hosts")) checkHosts(fs.readFileSync("/etc/hosts", "utf-8"));
}

const rpc = new DiscordRPC.Client({ transport: keys.rpcTransportType }),
      s = new spotifyWeb.SpotifyWebHelper(),
      appClient = keys.appClientID,
      largeImageKey = keys.imageKeys.large,
      smallImageKey = keys.imageKeys.small,
      smallImagePausedKey = keys.imageKeys.smallPaused;

var songEmitter = new events.EventEmitter(),
    currentSong = {};

async function checkSpotify() {
  s.getStatus(function(err, res) {
    if(err) {
      log.error("Failed to fetch Spotify data:", err);
      return;
    }

    if(!res.track.track_resource || !res.track.artist_resource) return;

    if(currentSong.uri && res.track.track_resource.uri == currentSong.uri && (res.playing != currentSong.playing)) {
      currentSong.playing = res.playing;
      songEmitter.emit('songUpdate', currentSong);
      return;
    }

    if(res.track.track_resource.uri == currentSong.uri) return;

    let start = parseInt(new Date().getTime().toString().substr(0, 10)),
        end = start + (res.track.length - res.playing_position);
    var song = {uri: res.track.track_resource.uri, name: res.track.track_resource.name, album: res.track.album_resource.name, artist: res.track.artist_resource.name, start, end, playing: res.playing};
    currentSong = song;

    songEmitter.emit('newSong', song);
  });
}

songEmitter.on('newSong', song => {
  rpc.setActivity({
    details: `🎵  ${song.name}`,
    state: `👤  ${song.artist}`,
	  startTimestamp: song.start,
		endTimestamp: song.end,
		largeImageKey,
    smallImageKey,
    largeImageText: `⛓  ${song.uri}`,
    smallImageText: `💿  ${song.album}`,
		instance: false,
  });

  log.info(`Updated song to: ${song.artist} - ${song.name}`);
});

songEmitter.on('songUpdate', song => {
  const startTimestamp = song.playing ? song.start : undefined,
        endTimestamp = song.playing ? song.end : undefined;

  rpc.setActivity({
    details: `🎵  ${song.name}`,
    state: `👤  ${song.artist}`,
    startTimestamp,
    endTimestamp,
    largeImageKey,
    smallImageKey: startTimestamp ? smallImageKey : smallImagePausedKey,
    largeImageText: `⛓  ${song.uri}`,
    smallImageText: `💿  ${song.album}`,
		instance: false,
  });

  log(`Song state updated (playing: ${song.playing})`)
});

rpc.on('ready', () => {
  log(`Connected to Discord! (${appClient})`);

  setInterval(() => {
    checkSpotify();
  }, 1500);
});

rpc.login(appClient).catch(log.error);

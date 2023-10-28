const io = require("socket.io")();
const socketapi = { io: io };
module.exports.server = socketapi;
io.on("connection", function (client) {
    client.on('init', async function (data) {
        client.join(data.channelID);
    });
});
// Events endpoints
module.exports.onNewEvent = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewEvent', reqData);
};
module.exports.onEditEvent = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onEditEvent', reqData);
};
module.exports.onEventLive = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onEventLive', reqData);
};
// Shop endpoints
module.exports.onNewShop = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewShop', reqData);
};
module.exports.onEditShop = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onEditShop', reqData);
};
// Shop offer endpoints
module.exports.onNewShopOffer = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewShopOffer', reqData);
};
module.exports.onEditShopOffer = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onEditShopOffer', reqData);
};
// Online offer endpoints
module.exports.onNewOnlineOffer = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewOnlineOffer', reqData);
};
module.exports.onEditOnlineOffer = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onEditOnlineOffer', reqData);
};
// Livestream endpoints
module.exports.onNewLivestream = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewLivestream', reqData);
};
module.exports.onEditLivestream = (channelID, reqData, organisername) => {
    io.in(channelID).emit('onNewLivestream', reqData);
};
// Other endpoints

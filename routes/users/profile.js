let express = require('express');
let router = express.Router();
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const mongoose = require('mongoose');
router.get('/', helper.authenticateToken, async (req, res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if (userData && userData != null) {
            return responseManager.onSuccess('User profile', userData, res);
        } else {
            return responseManager.badrequest({ message: 'Invalid token to get user profile, please try again' }, res);
        }
    } else {
        return responseManager.badrequest({ message: 'Invalid token to get user profile, please try again' }, res);
    }
});
router.post('/', helper.authenticateToken, async (req, res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
        const {name, goal, cycle, period_days, last_period_start_date, last_period_end_date , dob} = req.body;
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        const next_period_start_date = await helper.addDaysToTimestamp(last_period_end_date , cycle-1); // This function give me timestamp of next day of after 28 days but i want to get timestamp of after 28 days so i minus 1 day in cycle to get timestamp of after 28 days...
        const next_period_end_date = await helper.addDaysToTimestamp(next_period_start_date , period_days-1); // same reason...
        if(userData){
            let obj = {
                name: name,
                goal: goal,
                cycle: cycle,
                period_days: period_days,
                period_start_date: next_period_start_date,
                period_end_date: next_period_end_date,
                dob: dob,
                is_profile_completed: true,
                updatedBy: new mongoose.Types.ObjectId(req.token._id)
            }
            await primary.model(constants.MODELS.users, userModel).findByIdAndUpdate(req.token._id, obj);
            let updatedData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
            let lastCycle = {
                period_start_date: last_period_start_date,
                period_end_date: last_period_end_date,
                period_days: period_days,
                createdBy: new mongoose.Types.ObjectId(req.token._id)   
            }
            await primary.model(constants.MODELS.mycycles , mycycleModel).create(lastCycle);
            return responseManager.onSuccess('User profile updated successfully!', updatedData, res);
        }else{
            return responseManager.badrequest({message: 'Invalid token to update user profile, please try again'}, res);
        }
    } else {
        return responseManager.badrequest({message: 'Invalid token to update user profile, please try again'}, res);
    }
})
module.exports = router;
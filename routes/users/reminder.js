const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const reminderMasterModel = require('../../models/admin/reminder.master');
const reminderModel = require('../../models/users/reminder.model');

function isValidTime(str) {
    let regex = new RegExp(/((1[0-2]|0?[1-9]):([0-5][0-9]) ?([AaPp][Mm]))/);
    if (str == null) {
        return false;
    }
    if (regex.test(str) == true) {
        return true;
    }
    else {
        return false;
    }
}

router.get('/' , helper.authenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            let allReminders = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).find({status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
            return responseManager.onSuccess('Reminder list...!', allReminders , res);
        }else{            
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    } 
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
    const {reminderId , reminder_on , repeat , reminder_time , reminder_start , reminder_end , note} = req.body;
    const repeat_values = ['no_repeat' , 'daily' , 'weekly'];
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(reminderId && reminderId.trim() != '' && mongoose.Types.ObjectId.isValid(reminderId)){
                let reminderData = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).findById(reminderId).lean();
                if(reminderData && reminderData != null && reminderData.status === true){
                    if(reminder_on === true || reminder_on === false){
                        if(reminder_time && reminder_time.trim() != '' && isValidTime(reminder_time)){
                            if(note && note.trim() != '' && note.length <= 50){
                                if(repeat && repeat.trim() != '' && repeat_values.includes(repeat)){
                                    let userReminderData = await primary.model(constants.MODELS.reminders, reminderModel).findOne({reminder: new mongoose.Types.ObjectId(reminderData._id) , createdBy: new mongoose.Types.ObjectId(userData._id)}).lean();
                                    if(userReminderData && userReminderData != null){
                                        if(repeat === 'no_repeat'){
                                            if(reminder_start){
                                                let obj = {
                                                    reminder: new mongoose.Types.ObjectId(reminderData._id),
                                                    reminder_on: reminder_on,
                                                    repeat: repeat,
                                                    reminder_time: reminder_time,
                                                    reminder_start: reminder_start,
                                                    note: note,
                                                    updatedBy: new mongoose.Types.ObjectId(userData._id),
                                                    updatedAt: new Date()
                                                };
                                                let updatedUserReminderData = await primary.model(constants.MODELS.reminders, reminderModel).findByIdAndUpdate(userReminderData._id , obj , {returnOriginal: false}).lean();
                                                return responseManager.onSuccess('Reminder update successfully...!' ,  1 , res);
                                            }else{
                                                return responseManager.badrequest({message: 'Please provide reminder start date...!'}, res);
                                            }
                                        }else{
                                            if(reminder_start && reminder_end){
                                                if(reminder_start < reminder_end){
                                                    let obj = {
                                                        reminder: new mongoose.Types.ObjectId(reminderData._id),
                                                        reminder_on: reminder_on,
                                                        repeat: repeat,
                                                        reminder_time: reminder_time,
                                                        reminder_start: reminder_start,
                                                        reminder_end: reminder_end,
                                                        note: note,
                                                        updatedBy: new mongoose.Types.ObjectId(userData._id),
                                                        updatedAt: new Date()
                                                    };
                                                    let updatedUserReminderData = await primary.model(constants.MODELS.reminders, reminderModel).findByIdAndUpdate(userReminderData._id , obj , {returnOriginal: false}).lean();
                                                    return responseManager.onSuccess('Reminder update successfully...!' ,  1 , res);
                                                }else{
                                                    return responseManager.badrequest({message: 'Reminder end date less than start date...!'}, res);
                                                }
                                            }else{
                                                return responseManager.badrequest({message: 'Please provide reminder start and end date both for daily or weekly reminder...!'}, res);
                                            }
                                        }
                                    }else{
                                        if(repeat === 'no_repeat'){
                                            if(reminder_start){
                                                let obj = {
                                                    reminder: new mongoose.Types.ObjectId(reminderData._id),
                                                    reminder_on: reminder_on,
                                                    repeat: repeat,
                                                    reminder_time: reminder_time,
                                                    reminder_start: reminder_start,
                                                    note: note,
                                                    createdBy: new mongoose.Types.ObjectId(userData._id)
                                                };
                                                let newUserReminderData = await primary.model(constants.MODELS.reminders, reminderModel).create(obj);
                                                return responseManager.onSuccess('Reminder added successfully...!' , 1 , res);
                                            }else{
                                                return responseManager.badrequest({message: 'Please provide reminder start date...!'}, res);
                                            }
                                        }else{
                                            if(reminder_start && reminder_end){
                                                if(reminder_start < reminder_end){
                                                    let obj = {
                                                        reminder: new mongoose.Types.ObjectId(reminderData._id),
                                                        reminder_on: reminder_on,
                                                        repeat: repeat,
                                                        reminder_time: reminder_time,
                                                        reminder_start: reminder_start,
                                                        reminder_end: reminder_end,
                                                        note: note,
                                                        createdBy: new mongoose.Types.ObjectId(userData._id)
                                                    };
                                                    let newUserReminderData = await primary.model(constants.MODELS.reminders, reminderModel).create(obj);
                                                    return responseManager.onSuccess('Reminder added successfully...!' , 1 , res);
                                                }else{
                                                    return responseManager.badrequest({message: 'Reminder end date less than start date...!'}, res);
                                                }
                                            }else{
                                                return responseManager.badrequest({message: 'Please provide reminder start and end date both for daily or weekly reminder...!'}, res);
                                            }
                                        }
                                    }
                                }else{
        
                                }
                            }else{
                                return responseManager.badrequest({message: 'Please provide note (<=50 character) for reminder...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid reminder time format...!'}, res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Invalid reminder on value...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get reminder...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid id to get reminder...!'}, res);
            }
        }else{            
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});


module.exports = router;
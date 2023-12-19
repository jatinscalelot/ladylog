const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const staffModel =  require('../../models/admin/staff.model');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.staffies , staffModel).paginate({
                $or: [
                    {name: {$regex: search, $options: 'i'}},
                    {mobile: {$regex: search, $options: 'i'}}
                ]
            },{
                page,
                limit: parseInt(limit),
                select: '-createdBy -updatedBy -createdAt -updatedAt -token -__v',
                sort: {createdAt: -1},
                lean: true
            }).then((staffies) => {
                async.forEachSeries(staffies.docs, (staff , next_staff) => {
                    ( async () => {
                        let decryptedPassword = await helper.passwordDecryptor(staff.password);
                        staff.password = decryptedPassword;
                        next_staff();
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('Staffies data...!' , staffies , res);
                });
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
    const {staffId , name , mobile , password , status} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(name && name.trim() != ''){
                if(mobile && mobile.trim() != '' && mobile.length === 10 && /^\d+$/.test(mobile)){
                    if(password && password.trim() != ''){
                        if(status === true || status === false){
                            const encryptedPassword = await helper.passwordEncryptor(password);
                            if(staffId && staffId.trim() != '' && mongoose.Types.ObjectId.isValid(staffId)){
                                let staffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findById(staffId).lean();
                                if(staffMemberData && staffMemberData != null){
                                    let obj = {
                                        name: name.trim(),
                                        mobile: mobile.trim(),
                                        password: encryptedPassword,
                                        token: '',
                                        status: status,
                                        updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                        updatedAt: new Date()
                                    };
                                    let updatedStaffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findByIdAndUpdate(staffMemberData._id , obj , {returnOriginal: false}).lean();
                                    return responseManager.onSuccess('Staff member data updated successfully...!' , 1 , res);
                                }else{
                                    return responseManager.badrequest({message: 'Invalid id to update staff member data...!'}, res);
                                }
                            }else{
                                let obj = {
                                    name: name.trim(),
                                    mobile: mobile.trim(),
                                    password: encryptedPassword,
                                    status: status,
                                    createdBy: new mongoose.Types.ObjectId(adminData._id)
                                };
                                let newStaffMember = await primary.model(constants.MODELS.staffies , staffModel).create(obj);
                                return responseManager.onSuccess('New staff member added successfully...!' , 1 , res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid status...!'}, res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Please enter password...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Please enter valid mobile number...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Please enter staff member name...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;
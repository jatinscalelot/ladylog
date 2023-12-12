const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const axios = require('axios');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const addressModel = require('../../models/users/address.model');


router.post('/' , helper.authenticateToken , async (req , res) => {
    const {page , limit} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            primary.model(constants.MODELS.addresses, addressModel).paginate({
                createdBy: userData._id,
                status: true
            },{
                page,
                limit: parseInt(limit),
                sort: {createdAt: -1},
                select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v',
                lean: true
            }).then((addresses) => {
                return responseManager.onSuccess('All addressess...!' , addresses , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
})

router.post('/save' , helper.authenticateToken , async (req , res) => {
    const {addressId , floor , building_name , pincode , land_mark , city , state , country , status} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(floor && floor.trim() != ''){
                if(building_name && building_name.trim() != ''){
                    if(pincode && !(isNaN(pincode))){
                        const url = process.env.POSTAL_PIN_CODE_API + pincode;
                        let result = await axios.get(url);
                        if(result && result.status === 200 && result.data[0].Status === 'Success' && result.data[0].PostOffice.length > 0){
                            if(land_mark && land_mark.trim() != ''){
                                if(city && city.trim() != ''){
                                    if(state && state.trim() != ''){
                                        if(country && country.trim() != ''){
                                            if(status === true || status === false){
                                                if(addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)){
                                                    let addressData = await primary.model(constants.MODELS.addresses, addressModel).findOne({_id: new mongoose.Types.ObjectId(addressId) , createdBy: userData._id}).lean();
                                                    if(addressData && addressData != null && addressData.status === true){
                                                        let obj = {
                                                            floor_no: floor,
                                                            building_name: building_name,
                                                            pincode: pincode,
                                                            land_mark: land_mark,
                                                            city: city,
                                                            state: state,
                                                            country: country,
                                                            status: status,
                                                            updatedBy: new mongoose.Types.ObjectId(userData._id),
                                                            updatedAt: new Date()
                                                        };
                                                        let updatedAddressData = await primary.model(constants.MODELS.addresses, addressModel).findByIdAndUpdate(addressData._id , obj , {returnOriginal: false});
                                                        return responseManager.onSuccess('Address updatd successfully...!', 1 , res);
                                                    }else{
                                                        return responseManager.badrequest({message: 'Invalid id to get address, Please try again...!'}, res);
                                                    }
                                                }else{
                                                    let obj = {
                                                        floor_no: floor,
                                                        building_name: building_name,
                                                        pincode: pincode,
                                                        land_mark: land_mark,
                                                        city: city,
                                                        state: state,
                                                        country: country,
                                                        status: status,
                                                        createdBy: new mongoose.Types.ObjectId(userData._id),
                                                    };
                                                    let newAddress = await primary.model(constants.MODELS.addresses, addressModel).create(obj);
                                                    return responseManager.onSuccess('Address added successfully...!', 1 , res);
                                                }
                                            }else{
                                                return responseManager.badrequest({message: 'Invalid status, Please try again...!'}, res);
                                            }
                                        }else{
                                            return responseManager.badrequest({message: 'Please enter country name...!'}, res);
                                        }
                                    }else{
                                        return responseManager.badrequest({message: 'Please enter state name...!'}, res);
                                    }
                                }else{
                                    return responseManager.badrequest({message: 'Please enter city name...!'}, res);
                                }
                            }else{
                                return responseManager.badrequest({message: 'Invalid land mark for enter pincode...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Please enter valid pincode...!'}, res);
                        }
                    }else{  
                        return responseManager.badrequest({message: 'Please enter valid pincode...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Please enter a Business/Building Name...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Please enter a Apt/Suite/Floor...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const reviewModel = require('../../models/users/review.model');
const sizeMasterModel = require('../../models/admin/size.master');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');
const async = require('async');

function capitalizeFirstLetters(inputString) {
  const words = inputString.split(' ');
  const capitalizedWords = words.map(word => word.charAt(0).toUpperCase());
  const resultString = capitalizedWords.join('');
  return resultString;
}

async function checkProductDetails(productDetails){
  let valid = false;
  let promise = new Promise(function (resolve , reject) {
    async.forEachSeries(productDetails, (productDetail, next_productDetail) => {
      (async () => {
        if(productDetail.size && productDetail.size.trim() != '' && mongoose.Types.ObjectId.isValid(productDetail.size)){
          let primary = mongoConnection.useDb(constants.DEFAULT_DB);
          let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(productDetail.size).lean();
          if(sizeData && sizeData != null && sizeData.status === true){
            if((productDetail.stock || productDetail.stock === 0) && !isNaN(productDetail.stock) && productDetail.stock >= 0){
              if(productDetail.price && !isNaN(productDetail.price) && productDetail.price > 0){
                if((!isNaN(productDetail.discount_per) && productDetail.discount_per >= 0 && productDetail.discount_per <= 100) || (!isNaN(productDetail.discount_amount) && productDetail.discount_amount >= 0 && productDetail.discount_amount <= productDetail.price)){
                  if(productDetail.status === true || productDetail.status === false){
                    valid = true;
                    next_productDetail();
                  }else{
                    valid = false
                    reject(new Error({message: 'Invalid product details...!'}));
                  }
                }else{
                  valid = false;
                  reject(new Error({message: 'Invalid product details...!'}));
                }
              }else{
                valid = false;
                reject(new Error({message: 'Invalid product details...!'}));
              }
            }else{
              valid = false;
              reject(new Error({message: 'Invalid product details...!'}));
            }
          }else{
            valid = false;
            reject(new Error({message: 'Invalid product details...!'}));
          }
        }else{
          valid = false;
          reject(new Error({message: 'Invalid product details...!'}));
        }
      })().catch((error) => {
        return responseManager.onError(error , res);
      });
    }, () => {
      if(valid === true){
        let data = {valid: valid};
        resolve({message: 'Valid product details...!' , data});
      }else{
        reject(new Error({message: 'Invalid product details...!'}));
      }
    })
  });
  return promise;
}

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      primary.model(constants.MODELS.products, productModel).paginate({
        $or: [
          {title: {$regex: search, $options: 'i'}}
        ]
      },{
        page,
        limit: parseInt(limit),
        select: '-createdBy -updatedBy -createdAt -__v',
        sort: {createdAt: -1},
        lean: true
      }).then((products) => {
        async.forEachSeries(products.docs, (product, next_product) => {
          (async () => {
            let productVariants = await primary.model(constants.MODELS.veriants, veriantModel).find({product: product._id , status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').populate({
              path: 'size',
              model: primary.model(constants.MODELS.sizemasters, sizeMasterModel),
              select: '_id size_name'
            }).lean();
            product.productDetails = productVariants;
            let noofreview = parseInt(await primary.model(constants.MODELS.reviews, reviewModel).countDocuments({product: product._id}));
            if(noofreview > 0){
              let totalReviewsCountObj = await primary.model(constants.MODELS.reviews, reviewModel).aggregate([{$match: {product: product._id}} , {$group: {_id: null , sum: {$sum: '$rating'}}}]);
              if(totalReviewsCountObj && totalReviewsCountObj.length > 0 && totalReviewsCountObj[0].sum){
                product.ratings = parseFloat((totalReviewsCountObj[0].sum / noofreview).toFixed(1));
              }else{
                product.ratings = 0.0
              }
            }else{
              product.ratings = 0.0;
            }
            next_product();
          })().catch((error) => { });
        }, () => {
          return responseManager.onSuccess('Products details...!', products, res);
        });
      }).catch((error) => {
        return responseManager.onError(error, res);
      });
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again.' } , res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).select('-createdBy -updatedBy -createdAt -__v').lean();
        if(productData && productData != null){
          let productVariants = await primary.model(constants.MODELS.veriants, veriantModel).find({product: productData._id , status: true}).select('-product -createdBy -updatedBy -createdAt -updatedAt -__v').populate({
            path: 'size',
            model: primary.model(constants.MODELS.sizemasters, sizeMasterModel),
            select: '_id size_name'
          }).lean();
          productData.productDetails = productVariants;
          let noofreview = parseInt(await primary.model(constants.MODELS.reviews, reviewModel).countDocuments({product: productData._id}));
          if(noofreview > 0){
            let totalReviewsCountObj = await primary.model(constants.MODELS.reviews, reviewModel).aggregate([{$match: {product: productData._id}} , {$group: {_id: null , sum: {$sum: '$rating'}}}]);
            if(totalReviewsCountObj && totalReviewsCountObj.length > 0 && totalReviewsCountObj[0].sum){
              productData.ratings = parseFloat((totalReviewsCountObj[0].sum / noofreview).toFixed(1));
            }else{
              productData.ratings = 0.0
            }
          }else{
            productData.ratings = 0.0;
          }
          return responseManager.onSuccess('Product details...!' , productData , res);
        }else{
          return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.post('/review' , helper.authenticateToken , async (req , res) => {
  const {productId , page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
        if(productData && productData != null){
          await primary.model(constants.MODELS.reviews, reviewModel).paginate({
            product: productData._id
          }, {
            page,
            limit: parseInt(limit),
            limit: parseInt(limit),
            select: '-updatedBy -updatedAt -__v',
            populate: {path: 'createdBy' , model: primary.model(constants.MODELS.users, userModel) , select: '_id name profile_pic'},
            sort: {createdAt: -1},
            lean: true
          }).then((reviews) => {
            return responseManager.onSuccess('Product reviews...!', reviews, res);
          }).catch((error) => {
            return responseManager.onError(error , res);
          });
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {productId , title , bannerImage , description , productDetails , otherImages , cod , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(title && title.trim() != ''){
        if(bannerImage && bannerImage.trim != ''){
          if(description && description.trim != ''){
            if(otherImages && Array.isArray(otherImages) && otherImages.length > 0){
              if(status === true || status === false){
                if(cod === true || cod === false){
                  if(productDetails && Array.isArray(productDetails) && productDetails.length > 0){
                    checkProductDetails(productDetails).then((result) => {
                      (async () => {
                        if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
                          let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
                          if(productData && productData != null){
                            let productObj = {
                              title: title.trim(),
                              bannerImage: bannerImage.trim(),
                              description: description.trim(),
                              otherImages: otherImages,
                              cod: cod,
                              status: status,
                              updatedBy: new mongoose.Types.ObjectId(adminData._id),
                              updatedAt: new Date()
                            };
                            let updatedProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id , productObj , {returnOriginal: false}).lean();
                            async.forEachSeries(productDetails, (productDetail , next_productDetail) => {
                              (async () => {
                                if(productDetail._id && productDetail._id.trim() != '' && mongoose.Types.ObjectId.isValid(productDetail._id)){
                                  let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(productDetail._id).lean();
                                  if(veriantData && veriantData != null && veriantData.status === true){
                                    let sgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                                    let cgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                                    let gross_amount = parseFloat(parseFloat(parseFloat(productDetail.price) + cgst + sgst).toFixed(2));
                                    let discounted_amount = 0.0;
                                    let discount = 0;
                                    if(productDetail.discount_per && !isNaN(productDetail.discount_per) && parseFloat(productDetail.discount_per) > 0){
                                      discount = parseFloat(parseFloat(parseFloat(gross_amount) * parseFloat(productDetail.discount_per)) / 100);
                                      discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                                    }else if(productDetail.discount_amount && !isNaN(productDetail.discount_amount) && parseFloat(productDetail.discount_amount) > 0){
                                      discount = productDetail.discount_amount;
                                      discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                                    }else{
                                      discounted_amount = parseFloat(gross_amount);
                                    }
                                    let veriantObj = {
                                      product: new mongoose.Types.ObjectId(updatedProduct._id),
                                      size: new mongoose.Types.ObjectId(productDetail.size),
                                      SKUID: veriantData.SKUID,
                                      stock : parseInt(productDetail.stock),
                                      price : parseFloat(productDetail.price),
                                      sgst : parseFloat(sgst),
                                      cgst : parseFloat(cgst),
                                      gross_amount :  parseFloat(gross_amount),
                                      discount_per : parseFloat(productDetail.discount_per),
                                      discount_amount : parseFloat(productDetail.discount_amount),
                                      discount : parseFloat(discount),
                                      discounted_amount : parseFloat(discounted_amount),
                                      status: productDetail.status,
                                      updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                      updatedAt: new Date()
                                    };
                                    let updatedVeriantData = await primary.model(constants.MODELS.veriants, veriantModel).findByIdAndUpdate(veriantData._id , veriantObj , {returnOriginal: false}).lean();
                                    next_productDetail();
                                  }else{
                                    return responseManager.badrequest({message: 'Invalid id to get veriant of product...!'}, res);
                                  }
                                }else{
                                  let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(productDetail.size).lean();
                                  let sgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                                  let cgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                                  let gross_amount = parseFloat(parseFloat(parseFloat(productDetail.price) + cgst + sgst).toFixed(2));
                                  let discounted_amount = 0.0;
                                  let discount = 0;
                                  if(productDetail.discount_per && !isNaN(productDetail.discount_per) && parseFloat(productDetail.discount_per) > 0){
                                    discount = parseFloat(parseFloat(parseFloat(gross_amount) * parseFloat(productDetail.discount_per)) / 100);
                                    discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                                  }else if(productDetail.discount_amount && !isNaN(productDetail.discount_amount) && parseFloat(productDetail.discount_amount) > 0){
                                    discount = productDetail.discount_amount;
                                    discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                                  }else{
                                    discounted_amount = parseFloat(gross_amount);
                                  }
                                  let makeId = helper.makeid(8);
                                  let size_name = capitalizeFirstLetters(sizeData.size_name);
                                  let SKUID = helper.makeSKUID(makeId , size_name);
                                  let veriantObj = {
                                    product: new mongoose.Types.ObjectId(updatedProduct._id),
                                    size: new mongoose.Types.ObjectId(productDetail.size),
                                    SKUID: SKUID.trim(),
                                    stock : parseInt(productDetail.stock),
                                    price : parseFloat(productDetail.price),
                                    sgst : parseFloat(sgst),
                                    cgst : parseFloat(cgst),
                                    gross_amount :  parseFloat(gross_amount),
                                    discount_per : parseFloat(productDetail.discount_per),
                                    discount_amount : parseFloat(productDetail.discount_amount),
                                    discount : parseFloat(discount),
                                    discounted_amount : parseFloat(discounted_amount),
                                    status: productDetail.status,
                                    createdBy: new mongoose.Types.ObjectId(adminData._id)
                                  };
                                  await primary.model(constants.MODELS.veriants, veriantModel).create(veriantObj);
                                  next_productDetail();
                                }
                              })().catch((error) => {
                                return responseManager.onError(error , res);
                              });
                            }, () => {
                              return responseManager.onSuccess('Product updated successfully...!' , 1 , res);
                            });
                          }else{
                            return responseManager.badrequest({message: 'Invalid id to get product...!'} , res);
                          }
                        }else{
                          let productObj = {
                            title: title.trim(),
                            bannerImage: bannerImage.trim(),
                            description: description.trim(),
                            otherImages: otherImages,
                            cod: cod,
                            status: status,
                            createdBy: new mongoose.Types.ObjectId(adminData._id),
                          };
                          let newProduct = await primary.model(constants.MODELS.products, productModel).create(productObj);
                          async.forEachSeries(productDetails, (productDetail , next_productDetail) => {
                            (async () => {
                              let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(productDetail.size).lean();
                              let sgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                              let cgst = parseFloat(parseFloat(parseFloat(parseFloat(productDetail.price) * 9) / 100).toFixed(2));
                              let gross_amount = parseFloat(parseFloat(parseFloat(productDetail.price) + cgst + sgst).toFixed(2));
                              let discounted_amount = 0.0;
                              let discount = 0;
                              if(productDetail.discount_per && !isNaN(productDetail.discount_per) && parseFloat(productDetail.discount_per) > 0){
                                discount = parseFloat(parseFloat(parseFloat(gross_amount) * parseFloat(productDetail.discount_per)) / 100);
                                discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                              }else if(productDetail.discount_amount && !isNaN(productDetail.discount_amount) && parseFloat(productDetail.discount_amount) > 0){
                                discount = productDetail.discount_amount;
                                discounted_amount = parseFloat(parseFloat(gross_amount) - parseFloat(discount));
                              }else{
                                discounted_amount = parseFloat(gross_amount);
                              }
                              let makeId = helper.makeid(8);
                              let size_name = capitalizeFirstLetters(sizeData.size_name);
                              let SKUID = helper.makeSKUID(makeId , size_name);
                              let veriantObj = {
                                product: new mongoose.Types.ObjectId(newProduct._id),
                                size: new mongoose.Types.ObjectId(productDetail.size),
                                SKUID: SKUID.trim(),
                                stock : parseInt(productDetail.stock),
                                price : parseFloat(productDetail.price),
                                sgst : parseFloat(sgst),
                                cgst : parseFloat(cgst),
                                gross_amount :  parseFloat(gross_amount),
                                discount_per : parseFloat(productDetail.discount_per),
                                discount_amount : parseFloat(productDetail.discount_amount),
                                discount : parseFloat(discount),
                                discounted_amount : parseFloat(discounted_amount),
                                status: productDetail.status,
                                createdBy: new mongoose.Types.ObjectId(adminData._id)
                              };
                              await primary.model(constants.MODELS.veriants, veriantModel).create(veriantObj);
                              next_productDetail();
                            })().catch((error) => {
                              return responseManager.onError(error , res);
                            })
                          } , () => {
                            return responseManager.onSuccess('New product added successfully...!' , 1 , res);
                          });
                        }
                      })().catch((error) => {
                        return responseManager.onError(error , res);
                      });
                    }).catch((error) => {
                      return responseManager.badrequest({message: 'Invalid size or stock or price or discount perentage or discount amount or status for product veriant...!'}, res);
                    })
                  }else{ 
                    return responseManager.badrequest({message: 'Please add at least one veriant of product...!'} , res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Invalid cod status for product...!'} , res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid status for product...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Please select at least one other image of product...!'} , res);
            }
          }else{
            return responseManager.badrequest({message: 'Please provide product description...!'} , res);
          }
        }else{
          return responseManager.badrequest({message: 'Please select banner image for product..!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Please provide title for product...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/upload' , helper.authenticateToken , upload.single('productImages') , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
          let sizeOfImageInMB = helper.bytesToMB(req.file.size);
          if(sizeOfImageInMB <= 5){
            aws.saveToS3WithName(req.file.buffer , 'Products' , req.file.mimetype , 'Images').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Header image for product uploaded successfully...!' , data , res);
            }).catch((error) => {
              return responseManager.onError(error , res);
            });
          }else{
            return responseManager.badrequest({ message: 'Image file must be <= 5 MB, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again...!' }, res);
        }
      }else{
        return responseManager.badrequest({ message: 'Invalid file, please try again' }, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again...!' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again...!' } , res);
  }
});

router.post('/upload/multiple' , helper.authenticateToken , upload.array('productImages' , 5) , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      let files = req.files;
      if(files && files.length >= 0 && files.length <= 5){
        let paths = [];
        async.forEachSeries(files, (file , next_file) => {
          if(allowedContentTypes.imagearray.includes(file.mimetype)){
            let sizeOfImageInMB = helper.bytesToMB(file.size);
            if(sizeOfImageInMB <= 5){
              aws.saveToS3WithName(file.buffer , 'Products' , file.mimetype , 'Images').then((result) => {
                let data = {
                  path: result.data.Key,
                };
                paths.push(data);
                next_file();
              }).catch((error) => {
                return responseManager.onError(error , res);
              });
            }else{
              return responseManager.badrequest({ message: 'Image file must be <= 5 MB, please try again' }, res);
            }
          }else{
            return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again' }, res);
          }
        }, () => {
          return responseManager.onSuccess('Images upload successfully...!' , paths , res);
        });
      }else{
        return responseManager.badrequest({message: 'Please select only 5 images, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again...!' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again...!' } , res);
  }
});

router.post('/changeStatus' , helper.authenticateToken , async (req , res) => {
  const {productId , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).lean();
        if(productData && productData != null){
          if(status === true || status === false){
            let obj = {
              status: status,
              updatedBy: adminData._id,
              updatedAt: new Date()
            };
            let updateProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id , obj , {returnOriginal: false}).lean();
            return responseManager.onSuccess('Product status changed successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid status, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

module.exports = router;
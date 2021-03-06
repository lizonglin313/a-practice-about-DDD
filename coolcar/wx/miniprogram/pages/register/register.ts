import { ProfileService } from "../../service/profile"
import { rental } from "../../service/proto_gen/rental/rental_pb"
import { Coolcar } from "../../service/request"
import { formatDuration, padString } from "../../utils/format"
import { routing } from "../../utils/routing"


function formatDate(millis: number) {
    const dt = new Date(millis)
    const y = dt.getFullYear()
    const m = dt.getMonth() + 1
    const d = dt.getDate()
    return `${padString(y)}-${padString(m)}-${padString(d)}`
}

Page({
    redirectURL: '',
    profileRefresher: 0,
    data: {
        licNo: '',
        name: '',
        genderIndex: 0,
        genders: ['未知', '男', '女'],
        birthDate: '1990-01-01',
        licImgURL: '',
        state: rental.v1.IdentityStatus[rental.v1.IdentityStatus.UNSUBMITTED]
    },

    renderProfile(p: rental.v1.IProfile) {
        this.renderIdentity(p.identity!)
        this.setData({
            state: rental.v1.IdentityStatus[p.identityStatus || 0]
        })
    },


    renderIdentity(i?: rental.v1.IIdentity) {
        this.setData({
            licNo: i?.licNumber || '',
            name: i?.name || '',
            genderIndex: i?.gender || 0,
            birthDate: formatDate(i?.brithDateMillis || 0),
        })
    },

    onLoad(opt: Record<'redirect', string>) {
        const o: routing.RegisterOpts = opt
        if (o.redirect) {
            this.redirectURL = decodeURIComponent(o.redirect)
        }

        // 看 是否有信息
        ProfileService.getProfile().then(p => this.renderProfile(p))
        // 再拿 url 如果有
        ProfileService.getProfilePhoto().then(p => {

            // 根据拿到的URL制作下载请求
            // 用于测试获取图片URL
            //let lic_url_test: string = ''
            // let hasURL: boolean = false
            // 测试获取
            wx.downloadFile({
                url: p.url || '',   // 如果空 就是404
                header: { 'Content-Type': 'image/jpeg' },
                success(res) {
                    // 只要服务器有响应数据，就会把响应内容写入文件并进入 success 回调，业务需要自行判断是否下载到了想要的内容
                    if (res.statusCode === 200) {
                        console.log(res.tempFilePath)
                        // 直接 set 到图片路径
                        wx.setStorageSync('licPicUrl', res.tempFilePath)

                    } else {
                        wx.setStorageSync('licPicUrl', '')
                    }

                },


            })

            console.log("storage", wx.getStorageSync('licPicUrl'))
            this.setData({
                licImgURL: wx.getStorageSync('licPicUrl'),
            })


            // else {
            //     this.setData({
            //         licImgURL:'',
            //     })
            // }
        })
    },

    onReady() {
        // 避免 没有 load 完的时候 就跳过了
        // 所以这里再进行一次赋值
        // 这种做法的问题是： 图片会闪一下， 因为有可能加载了两次
        setTimeout(res => {
            console.log("onReady-storage", wx.getStorageSync('licPicUrl'))
            this.setData({
                licImgURL: wx.getStorageSync('licPicUrl'),
            })
        }, 2000)

    },

    onUnload() {
        this.clearProfileRefresher()
    },

    onUploadLic() {

        wx.chooseImage({
            success: async res => {
                if (res.tempFilePaths.length === 0) {
                    return
                }

                this.setData({
                    licImgURL: res.tempFilePaths[0]
                })

                const photoRes = await ProfileService.createProfilePhoto()
                if (!photoRes.uploadUrl) {
                    return
                }
                await Coolcar.uploadfile({
                    localPath: res.tempFilePaths[0],
                    url: photoRes.uploadUrl,
                })
                const identity = await ProfileService.completeProfilePhoto()
                this.renderIdentity(identity)

                // TODO: upload lic
                // const data = wx.getFileSystemManager().readFileSync(res.tempFilePaths[0])

                // // 测试上传
                // wx.request({
                //     method: 'PUT',
                //     url: 'http://coolcar-lzl.oss-cn-beijing.aliyuncs.com/account_9623aef4bf56efac37b44f217?Expires=1648030515&OSSAccessKeyId=LTAI5tLK8Ckc7uPgkxTFh5aB&Signature=%2FB9XfwiToAeqO0wpTnBOormBp7Q%3D',
                //     data: data,
                //     header: {'Content-Type': 'image/jpeg'},
                //     success: console.log,
                //     fail: console.error,
                // })




                // 假设等一秒才拿到解析完
                // setTimeout(() => {
                //     this.setData({
                //         licNo: '3243633254',
                //         name: '张三',
                //         genderIndex: 1,
                //         birthDate: '1999-12-23',
                //     })
                // }, 1000)


            }
        })
    },

    onGenderChange(e: any) {
        this.setData({
            genderIndex: parseInt(e.detail.value),
        })
    },

    onBirthDateChange(e: any) {
        this.setData({
            birthDate: e.detail.value,
        })
    },

    onSubmit() {
        ProfileService.submintProfile({
            licNumber: this.data.licNo,
            name: this.data.name,
            gender: this.data.genderIndex,
            brithDateMillis: Date.parse(this.data.birthDate)
        }).then(p => {
            this.renderProfile(p)
            this.scheduleProfileRefresher()
        })
    },

    scheduleProfileRefresher() {
        // 每秒进行轮询
        this.profileRefresher = setInterval(() => {
            ProfileService.getProfile().then(p => {
                this.renderProfile(p)
                if (p.identityStatus !== rental.v1.IdentityStatus.PENDING) {
                    this.clearProfileRefresher()
                }
                if (p.identityStatus === rental.v1.IdentityStatus.VERIFIED) {
                    this.onLicVerified()
                }
            })
        }, 1000)
    },

    clearProfileRefresher() {
        if (this.profileRefresher) {
            clearInterval(this.profileRefresher)
            this.profileRefresher = 0
        }
    },

    onReSubmit() {
        ProfileService.clearProfile().then(p => this.renderProfile(p))
        ProfileService.clearProfilePhoto().then(() => {
            this.setData({
                licImgURL: '',
            })
        })
        // 不要忘记清一下缓存
        wx.setStorageSync('licPicUrl', '')
    },
    onLicVerified() {
        // this.setData({
        //     state: 'VERIFIED',
        // })
        if (this.redirectURL) {
            wx.redirectTo({
                url: this.redirectURL,
            })
        }

    }
})
const shareLocationKey = "share_location"
Page({
    data: {
        shareLocation: false,
        avatarURL: '',
    },

    async onLoad(opt) {
        console.log('unlocking car', opt.car_id)
        const userInfo = await getApp<IAppOption>().globalData.userInfo
        this.setData({
            avatarURL: userInfo.avatarUrl,
            shareLocation: wx.getStorageSync(shareLocationKey) || false
        })
    },
    onGetUserInfo(e: any) {
        const userInfo: WechatMiniprogram.UserInfo = e.detail.userInfo
        if (userInfo) {
            getApp<IAppOption>().resolveUserInfo(userInfo)
            this.setData({
                shareLocation: true,
            })
            wx.setStorageSync(shareLocationKey, this.data.shareLocation)
        }

    },
    onShareLocation(e: any) {
        const shareLocation: boolean = e.detail.value
        wx.setStorageSync(shareLocationKey, shareLocation)
    },
    onUnlockTap() {
        wx.getLocation({
            type: 'gcj02',
            success: loc => {
                console.log('starting a trip', {
                    location: {
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                    },
                    // TODO: 需要双向绑定
                    avatarURL: this.data.shareLocation ? this.data.avatarURL : '',
                })
                const tripID = 'trip123'

                    wx.showLoading({
                        title: '开锁中',
                        mask: true,
                    })

                    setTimeout(() => {
                        wx.redirectTo({
                            url: `/pages/driving/driving?trip_id=${tripID}`,
                            complete: () => {
                                wx.hideLoading()
                            }
                        })
                    }, 3000)

            },

            fail: () => {
                wx.showToast({
                    icon: 'none',
                    title: '请前往设置页面授权您的位置信息',
                })
            }
        })


    }
})
# 在K8s上从头部署一个Golang微服务应用

## 制作Docker镜像

### 代码在哪里编译？构建Golang编译环境

思路是首先拉取并进入go的容器：

```shell
>docker run -it golang:1.16
Unable to find image 'golang:1.16' locally
1.16: Pulling from library/golang
e4d61adff207: Pull complete
4ff1945c672b: Pull complete
ff5b10aec998: Pull complete
12de8c754e45: Pull complete
8c86ff77a317: Pull complete
0395a1c478ba: Pull complete
245345d44ed8: Pull complete
Digest: sha256:5f6a4662de3efc6d6bb812d02e9de3d8698eea16b8eb7281f03e6f3e8383018e
Status: Downloaded newer image for golang:1.16
root@beea2791a55d:/go# ls
bin  src
root@beea2791a55d:/go# go env
GO111MODULE=""
...
GOPATH="/go"
GOPRIVATE=""
GOPROXY="https://proxy.golang.org,direct"
...
root@beea2791a55d:/go# go env -w GO111MODULE=on
root@beea2791a55d:/go# go env -w GOPROXY=https://goproxy.cn,direct
```

配好环境后，要将我们的源代码拷进`/go/src`目录中，使用`go install`后将被编译到`/go/bin`目录下。

### 构建Dockerfile自动化完成上述内容

以`gateway`服务为例进行尝试：

```dockerfile
# 启动编译环境
FROM golang:1.16

# 配置编译环境
RUN go env -w GO111MODULE=on
RUN go env -w GOPROXY=https://goproxy.cn,direct

# 拷贝源代码到镜像中 注意 [源目录] 以及 执行 [docker build] 的目录
COPY . /go/src/coolcar/server

# 编译
WORKDIR /go/src/coolcar/server
RUN go install ./gateway/...

# 并不真正向外界暴露端口 只是让你知道
# 可使用 docker run  -p 将这个端口与容器外部端口连接
EXPOSE 8123

# 设置服务入口
ENTRYPOINT [ "/go/bin/gateway" ]
```

> 这里注意`ENTRYPOINT`和`CMD`的区别。
>
> 实际上，这二者是连起来用的，如：
>
> ENTRYPOINT [ "echo",  "a" ]
>
> CMD ["b"]
>
> 那么就会输出： `a b`
>
> 但是如果在运行镜像时，有：`docker run image-name c d`
>
> 则会输出：`a c d`。
>
> 简单说，`ENTRYPOINT`是必须执行的，写死的，而`CMD`在没有给出额外参数时作为默认的命令，有额外参数时则会覆盖`CMD`的内容。所以如果有命令想让用户重写，就加上`CMD`。

`docker build -t 编译后镜像的名字 -f 对应的Dockerfile 进行编译的目录 `

```shell
> docker build -t coolcar/gateway -f ..\deployment\gateway\Dockerfile .
[+] Building 1.3s (9/9) FINISHED
 => [internal] load build definition from Dockerfile                                                                               0.0s 
 => => transferring dockerfile: 282B                                                                                               0.0s 
 => [internal] load .dockerignore                                                                                                  0.0s 
 => [1/4] FROM docker.io/library/golang:1.16                                                                                       0.2s 
 => [internal] load build context                                                                                                  0.1s 
 => => transferring context: 967.34kB                                                                                              0.1s 
 => [2/4] RUN go env -w GO111MODULE=on                                                                                             0.4s 
 => [3/4] RUN go env -w GOPROXY=https://goproxy.cn,direct                                                                          0.5s 
 => [4/4] COPY . /go/src/coolcar/server                                                                                            0.0s 
 => exporting to image                                                                                                             0.1s 
 => => exporting layers                                                                                                            0.0s 
 => => writing image sha256:0fa1daf5e1c2bb1d81f23125e5625762d69b773c8e1b299f7840678dccd96def                                       0.0s 
 => => naming to docker.io/coolcar/gateway                                                                                         0.0s 

Use 'docker scan' to run Snyk tests against images to find vulnerabilities and learn how to fix them
PS D:\Coding\WorkPlace\Golang\a-practice-about-DDD\coolcar\server> docker build -t coolcar/gateway -f ..\deployment\gateway\Dockerfile .

[+] Building 22.7s (11/11) FINISHED
 => [internal] load build definition from Dockerfile                                                                               0.0s 
 => => transferring dockerfile: 378B                                                                                               0.0s 
 => [internal] load .dockerignore                                                                                                  0.0s 
 => => transferring context: 2B                                                                                                    0.0s 
 => [internal] load metadata for docker.io/library/golang:1.16                                                                     0.0s 
 => [1/6] FROM docker.io/library/golang:1.16                                                                                       0.0s 
 => [internal] load build context                                                                                                  0.1s 
 => => transferring context: 5.59kB                                                                                                0.0s 
 => CACHED [2/6] RUN go env -w GO111MODULE=on                                                                                      0.0s 
 => CACHED [3/6] RUN go env -w GOPROXY=https://goproxy.cn,direct                                                                   0.0s 
 => CACHED [4/6] COPY . /go/src/coolcar/server                                                                                     0.0s 
 => [5/6] WORKDIR /go/src/coolcar/server                                                                                           0.0s 
 => [6/6] RUN go install ./gateway/...                                                                                            20.2s 
 => exporting to image                                                                                                             2.3s 
 => => exporting layers                                                                                                            2.3s 
 => => writing image sha256:ba352f8a4b9d6eb5d06e1703a6b9989e0c4d8f31bfa4edefd479cefdc38935d9                                       0.0s 
 => => naming to docker.io/coolcar/gateway                                                                                         0.0s 

Use 'docker scan' to run Snyk tests against images to find vulnerabilities and learn how to fix them
> docker image ls
REPOSITORY                               TAG                                                     IMAGE ID       CREATED          SIZE
coolcar/gateway                          latest                                                  ba352f8a4b9d   32 seconds ago   1.19GB 
```

镜像太大，需要进行瘦身。

### 镜像瘦身

思路是**在中间镜像中进行编译**，编译完成后**将可执行文件放入真正的生产镜像**。

首先有一个问题，上面的编译后的可执行文件不能在alpine中运行，所以：

```dockerfile
# 编译 使用跨平台交叉编译
# CGO_ENABLED涉及到编译过程中如链接等底层内容
# 这样编译的文件就能在alpine中跑
WORKDIR /go/src/coolcar/server
RUN CGO_ENABLED=0 GOOS=linux go install ./gateway/...
```

或者，直接基于alpine的golang进行编译：

```dockerfile
FROM golang:1.16-alpine
```

但是这样编译的镜像仍有几百MB。

#### Docker的强大功能 —— 多阶段构建

修改后的多阶段构建文件如下：

```dockerfile
# 启动编译环境 第一阶段
FROM golang:1.16-alpine AS builder

# 配置编译环境
RUN go env -w GO111MODULE=on
RUN go env -w GOPROXY=https://goproxy.cn,direct

# 拷贝源代码到镜像中
COPY . /go/src/coolcar/server

# 编译 使用跨平台交叉编译
# CGO_ENABLED涉及到编译过程中如链接等底层内容
# 这样编译的文件就能在alpine中跑
WORKDIR /go/src/coolcar/server
RUN CGO_ENABLED=0 GOOS=linux go install ./gateway/...

# 将编译后的可执行文件放入新的环境 构建生产镜像 第二阶段
FROM alpine:3.13
COPY --from=builder /go/bin/gateway /bin/gateway

# 将端口暴露（容器中的端口）有了此端口，可使用 docker run  -p 将这个端口与容器外部端口连接
EXPOSE 8123

# 设置服务入口
ENTRYPOINT [ "/bin/gateway" ]
```

```shell
> docker image ls
REPOSITORY                               TAG                                                     IMAGE ID       CREATED              SIZE  
coolcar/gateway                          latest                                                  421abdba262c   About a minute ago   20.4MB
```

 可以发现，新的镜像只有20多MB，相比之前1G轻量化许多。

## 代码中可变参数配置化

在启动服务时，会指定一些地址、端口、用户名等信息，这些数据不能写死在代码中，而是要进行抽取，以用户和配置的在启动服务时注入。

#### 动态配置

- 通过配置服务/数据库更改配置
- 容易出错
- 往往难以追溯和回滚
- 对配置生效的延时要求不同

#### 静态配置

- 被持续集成流程所保护
- 适用于微服务
- 配置来源：注意这里的优先级是自上而下的(社区约定俗称的规范)
  - 命令行参数
  - 环境变量(在kubernetes中比较提倡使用环境变量注入参数 ，因为有Pod提供隔离环境)
  - 配置文件：ini格式或yaml格式等
  - 默认值

使用`"github.com/namsral/flag"`包，将配置参数抽取，可用命令行或环境变量等方式注入。

## 为所有服务制作镜像

参照上面的Dockerfile为每个微服务模块制作镜像，并上传至阿里云仓库。

## 启动K8s集群

这里安装我之前博客的流程，在本地是1个Master，1个Worker。

## 部署微服务

### 基础配置和部署

#### 创建Secret使集群可以访问私有仓库

Kubernetes手册：

```shell
kubectl create secret docker-registry myregistrykey --docker-server=DUMMY_SERVER \
          --docker-username=DUMMY_USERNAME --docker-password=DUMMY_DOCKER_PASSWORD \
          --docker-email=DUMMY_DOCKER_EMAIL
```

阿里云手册：

```shell
kubectl create secret docker-registry [$Reg_Secret] --docker-server=[$Registry] --docker-username=[$Username] --docker-password=[$Password] --docker-email=[$Email]
```

我用的：

```shell
root@lzl-a:/# kubectl create secret docker-registry [你的secret名] --docker-server=registry.cn-hangzhou.aliyuncs.com --docker-username=[$登录阿里云镜像仓库时的用户名] --docker-password=[$对应的pwd]
secret/lzl-aliyun-reg-secret created
root@lzl-a:/# kubectl get secrets
NAME                    TYPE                                  DATA   AGE
default-token-s9tk7     kubernetes.io/service-account-token   3      102m
lzl-aliyun-reg-secret   kubernetes.io/dockerconfigjson        1      2m
```

> 这里发现一个问题，我配置好之后发现实际上是无法访问阿里云容器仓库的，但是我配置用户名、密码、仓库地址都没问题。
>
> 然后看到说是DNS问题，我在本地虚拟机的DNS并不是8.8.8.8这种，而是本地的一个虚拟网关，然后按照：https://blog.csdn.net/booklijian/article/details/116491288 修改DNS进行尝试。
>
> 可能是由于网络的原因，在另一台虚拟机上发现没有修改DNS也可以正常ping通阿里云镜像仓库。

**注意：这里有两种方式使secret生效**：

1. 在Pod部署文件中，通过`imagePullSecrets`字段显示将secret用于这次部署；
2. 将`ImagePullSecrets`添加到服务账号：

![image-20220413141432435](https://picgo-lzl.oss-cn-beijing.aliyuncs.com/image-20220413141432435.png)

> https://kubernetes.io/zh/docs/tasks/configure-pod-container/configure-service-account/#add-imagepullsecrets-to-a-service-account

#### 编写部署文件

以gateway为例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  labels:
    app: gateway
spec:
  replicas: 1
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
      - name: gateway
        image: registry.cn-hangzhou.aliyuncs.com/coolcar-lzl/gateway:1.3
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8080
        resources:
          limits:
            cpu: 100m
            memory: 128Mi
      imagePullSecrets:
        - name: lzl-aliyun-reg-secret	# 需要告诉私用仓库的secret信息
```

部署：

```shell
root@lzl-a:/home/lzl/WP/coolcar/deployment/gateway# kubectl apply -f gateway.yaml 
deployment.apps/gateway created
root@lzl-a:/home/lzl/WP/coolcar/deployment/gateway# kubectl get pods
NAME                       READY   STATUS    RESTARTS   AGE
gateway-7f48845d98-mzb45   1/1     Running   0          14s
```

创建Service，在原有deploy文件追加：

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: gateway
spec:
  selector:
    app: gateway
  ports:
  - protocol: TCP
    port: 8080
```

部署Service：

```shell
root@lzl-a:/home/lzl/WP/coolcar/deployment/gateway# kubectl apply -f gateway.yaml 
deployment.apps/gateway unchanged
service/gateway created
root@lzl-a:/home/lzl/WP/coolcar/deployment/gateway# kubectl get svc
NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
gateway      ClusterIP   10.109.122.88   <none>        8080/TCP   5s
kubernetes   ClusterIP   10.96.0.1       <none>        443/TCP    117m
root@lzl-a:/home/lzl/WP/coolcar/deployment/gateway# curl 10.109.122.88:8080
{"code":5,"message":"Not Found"}
```

到这里可以从集群中访问到该服务了。如果想在集群外访问，就按照前面的文章，开一个NodePort即可。

### 调试

涉及到调试的点大致有以下：

- Pod的启动过程
- 查看服务状态
- 查看启动时间
- 查看日志

#### 查看Pod启动信息

- `kubectl describe pod ${POD_NAME} `

#### 查看Pod中运行的应用日志

- `kubectl logs ${POD_NAME}`
  - `-f`：使用该参数，log界面不会退出，持续将终端作为应用日志的输出位置；不加该参数则在终端输出所有日志后返回。
  - `-p / --previous`：有时候服务跑着就挂了，前面的日志看不到，就可以使用该参数看到之前的日志。

可以看到运行在Pod中的应用打印在sysout的日志。

### 进阶配置

#### ConfigMap

用于做一些常规的配置，例如某个服务的地址，端口号等，如下：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: endpoints
data:
  auth: auth:8081
```

如果要使用里面的值，需要在部署Pod的文件中的`spec`中指定：

```yaml
spec:
      containers:
      - name: auth
        image: xxxx
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 9090
        env:
          - name: AUTH_ADDR # 例如这里环境变量需要使用ConfigMap
            valueFrom:	
              configMapKeyRef:
                key: auth
                name: endpoints	# configmap的名字
```

#### Secret

用来存放一些敏感数据：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: wechat
type: Opaque
stringData:		# 如果这里的类型是data则需要存放base64编码的二进制数据
  appid: xxxxx
  appsecret: xxxxx
```

使用方法和ConfigMap大致相同：

```yaml
spec:
        env:
          - name: WECHAT_APP_ID
            valueFrom:
              secretKeyRef:
                key: appid
                name: wechat
```


































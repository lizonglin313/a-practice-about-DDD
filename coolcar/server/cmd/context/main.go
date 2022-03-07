package main

import (
	"context"
	"fmt"
	"time"
)

type paramKey struct {

}

func main() {
	c := context.WithValue(context.Background(), paramKey{}, "abc")
	c, cancel := context.WithTimeout(c, 5 * time.Second)
	defer cancel()
	mainTask(c)

	time.Sleep(time.Hour)
}

func mainTask(c context.Context)  {
	fmt.Printf("main task started with param %q\n", c.Value(paramKey{}))
	go func() {
		c1, cancel := context.WithTimeout(context.Background(), time.Second * 10)
		defer cancel()
		go smallTask(c1, "task1", 9 * time.Second)
	}()
	smallTask(c, "task2", 2 * time.Second)
}

func smallTask(c context.Context,name string, d time.Duration)  {
	fmt.Printf("%s started with param %q\n", name, c.Value(paramKey{}))
	select {
	case <-time.After(d):
		fmt.Printf("%s done\n", name)
	case <- c.Done():
		fmt.Printf("%s cancelled\n", name)
	}
}